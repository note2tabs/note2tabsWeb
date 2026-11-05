import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { readFreeCreditBalance, refreshFreeCreditBalance } from "../../lib/freeCreditBalance";
import { getCreditWindow, buildCreditsSummary } from "../../lib/credits";

// Opt-in only: requires a real PostgreSQL database. Uses a synthetic account,
// never existing users, and deletes both rows even if an assertion fails.
describe.skipIf(process.env.CREDIT_BALANCE_DATABASE_TEST !== "1")("free credit balance on PostgreSQL", () => {
  const id = `qa-read-only-credit-${randomUUID()}`;
  const window = getCreditWindow();
  const summary = buildCreditsSummary({ usedCredits: 0, resetAt: window.resetAt, isPremium: false });
  const snapshot = () => prisma.$queryRaw`
    SELECT u.xmin::text AS user_version, u."tokensRemaining", b.xmin::text AS balance_version,
      b.credits, b."updatedAt" FROM "User" u LEFT JOIN user_credits b ON b."userId"=u.id WHERE u.id=${id}
  `;
  const readOnly = () => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return readFreeCreditBalance(id, summary, window.start, tx);
  });
  beforeAll(async () => {
    await prisma.$executeRaw`INSERT INTO "User" (id,email,role,"subscriptionPlan","tokensRemaining","updatedAt")
      VALUES (${id},${id + "@example.invalid"},'FREE','FREE',7,NOW())`;
  });
  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM user_credits WHERE "userId"=${id}`;
    await prisma.$executeRaw`DELETE FROM "User" WHERE id=${id}`;
    await prisma.$disconnect();
  });
  it("reads missing, active, refunded and expired balances without writes; grants once on submission", async () => {
    let before = await snapshot();
    expect((await readOnly()).remaining).toBe(7);
    expect(await snapshot()).toEqual(before); // missing ledger is not inserted

    await prisma.$executeRaw`INSERT INTO user_credits ("userId",credits,"createdAt","updatedAt") VALUES (${id},6,NOW(),NOW())`;
    before = await snapshot();
    expect((await Promise.all(Array.from({ length: 8 }, readOnly))).map(r => r.remaining)).toEqual(Array(8).fill(6));
    expect(await snapshot()).toEqual(before); // includes physical row versions

    await prisma.$executeRaw`UPDATE user_credits SET credits=8,"updatedAt"=NOW() WHERE "userId"=${id}`;
    expect((await readOnly()).remaining).toBe(8); // authoritative refund, not saved results
    const stale = new Date(window.start.getTime() - 1);
    await prisma.$executeRaw`UPDATE user_credits SET credits=2,"updatedAt"=${stale} WHERE "userId"=${id}`;
    before = await snapshot();
    expect((await readOnly()).remaining).toBe(10); // virtual monthly reset
    expect(await snapshot()).toEqual(before);
    expect((await Promise.all(Array.from({ length: 4 }, () => refreshFreeCreditBalance(id, summary, window.start))))
      .map(r => r.remaining)).toEqual([10,10,10,10]);
    await prisma.$executeRaw`UPDATE user_credits SET credits=6,"updatedAt"=NOW() WHERE "userId"=${id}`;
    expect((await refreshFreeCreditBalance(id, summary, window.start)).remaining).toBe(6); // no repeated grant

    // Reads racing with a real atomic debit must not restore any credits.
    await Promise.all([
      ...Array.from({ length: 8 }, readOnly),
      prisma.$executeRaw`UPDATE user_credits SET credits=credits-2,"updatedAt"=NOW() WHERE "userId"=${id} AND credits>=2`,
    ]);
    expect((await readOnly()).remaining).toBe(4);
    expect((await refreshFreeCreditBalance(id, summary, window.start)).remaining).toBe(4);

    await prisma.$executeRaw`DELETE FROM user_credits WHERE "userId"=${id}`;
    expect((await refreshFreeCreditBalance(id, summary, window.start)).remaining).toBe(4); // initialize conservatively
    await prisma.$executeRaw`UPDATE "User" SET role='PREMIUM',"subscriptionPlan"='PREMIUM',"tokensRemaining"=100 WHERE id=${id}`;
    before = await snapshot();
    await expect(readOnly()).rejects.toThrow("Account changed");
    await expect(refreshFreeCreditBalance(id, summary, window.start)).rejects.toThrow("Account changed");
    expect(await snapshot()).toEqual(before);
  }, 60000);
});
