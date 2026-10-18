import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Client } from "pg";
import { readFile } from "node:fs/promises";
const m = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../lib/prisma", () => ({
  prisma: new Proxy({}, { get: (_, k) => m.db[k] }),
}));
import {
  queuePaidCreditReset,
  collectFreeCreditResets,
  creditResetCandidates,
  claimCreditReset,
  finishCreditReset,
  freeResetWindow,
} from "../../lib/creditResetNotices";
const url = process.env.N2T_CREDIT_RESET_TEST_DB_URL;
if (url) {
  const u = new URL(url);
  if (u.hostname !== "127.0.0.1" || u.pathname !== "/credit_reset_test")
    throw new Error("Disposable local test DB required");
}
describe.skipIf(!url)("credit reset PostgreSQL delivery state", () => {
  let db: Client;
  const now = new Date("2026-11-01T03:00:00Z");
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("BEGIN");
    await db.query(`CREATE TEMP TABLE "User"(id text PRIMARY KEY,email text,role text,"subscriptionPlan" text,"emailVerified" timestamptz,"emailVerifiedBool" boolean,"tokensRemaining" int);
  CREATE TEMP TABLE user_credits("userId" text,credits int,"updatedAt" timestamptz);
  CREATE TEMP TABLE "TabJob"("userId" text,"createdAt" timestamptz);
  CREATE TEMP TABLE "EngagementEmailPermission"("accountId" text,allowed boolean);
  CREATE TEMP TABLE "VerificationToken"(identifier text,expires timestamptz);
  CREATE TEMP TABLE "EngagementEnrollment"("accountId" text,version text);
  CREATE TEMP TABLE "EngagementContact"("accountId" text,channel text,"createdAt" timestamptz);`);
    await db.query(
      (
        await readFile(
          "prisma/migrations/20261018030000_credit_reset_notice/migration.sql",
          "utf8",
        )
      ).replace("CREATE TABLE", "CREATE TEMP TABLE"),
    );
    const query = (s: TemplateStringsArray, ...v: unknown[]) =>
      db.query(
        s.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""),
        v,
      );
    m.db = {
      $queryRaw: async (...args: any[]) => (await (query as any)(...args)).rows,
      $executeRaw: async (...args: any[]) =>
        (await (query as any)(...args)).rowCount,
    };
  });
  afterAll(async () => {
    await db.query("ROLLBACK");
    await db.end();
  });
  beforeEach(async () => {
    vi.stubEnv("CREDIT_RESET_EMAIL_ENABLED", "true");
    await db.query(
      'TRUNCATE "CreditResetNotice","User",user_credits,"TabJob","EngagementEmailPermission","VerificationToken","EngagementEnrollment","EngagementContact" CASCADE',
    );
    await db.query(
      `INSERT INTO "User" VALUES('user','synthetic@example.test','FREE','FREE',NOW(),TRUE,2);INSERT INTO user_credits VALUES('user',2,'2026-10-31');INSERT INTO "TabJob" VALUES('user','2026-10-31');INSERT INTO "EngagementEmailPermission" VALUES('user',TRUE)`,
    );
  });
  it("queues free low balances once per month and respects calendar boundaries", async () => {
    expect(await collectFreeCreditResets(now)).toBe(1);
    expect(await collectFreeCreditResets(now)).toBe(0);
    expect((await creditResetCandidates(now)).length).toBe(1);
    expect(freeResetWindow(new Date("2027-01-01")).previous.toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
    expect(await collectFreeCreditResets(new Date("2026-11-04"))).toBe(0);
  });
  it("skips unused/high balances and users who already resumed after reset", async () => {
    await db.query("UPDATE user_credits SET credits=4");
    expect(await collectFreeCreditResets(now)).toBe(0);
    await db.query(
      `UPDATE user_credits SET credits=2;INSERT INTO "TabJob" VALUES('user','2026-11-01')`,
    );
    expect(await collectFreeCreditResets(now)).toBe(0);
  });
  it("rechecks backend activity and notice expiry before sending", async () => {
    await collectFreeCreditResets(now);
    await db.query(
      `UPDATE user_credits SET "updatedAt"='2026-11-01T02:00:00Z',credits=8`,
    );
    expect(await creditResetCandidates(now)).toEqual([]);
    await db.query(
      `UPDATE user_credits SET "updatedAt"='2026-10-31',credits=2`,
    );
    expect(await creditResetCandidates(new Date("2026-11-04"))).toEqual([]);
  });
  it("preserves paid renewal deduplication and low-balance threshold inside grant transaction", async () => {
    await db.query(
      `UPDATE "User" SET role='PREMIUM',"subscriptionPlan"='PREMIUM',"tokensRemaining"=103`,
    );
    const tx = m.db;
    await queuePaidCreditReset(tx, {
      accountId: "user",
      invoiceId: "invoice",
      previousBalance: 3,
      now,
    });
    await queuePaidCreditReset(tx, {
      accountId: "user",
      invoiceId: "invoice",
      previousBalance: 3,
      now,
    });
    await queuePaidCreditReset(tx, {
      accountId: "user",
      invoiceId: "high",
      previousBalance: 4,
      now,
    });
    expect(
      (await db.query('SELECT * FROM "CreditResetNotice"')).rows.length,
    ).toBe(1);
    expect((await creditResetCandidates(now))[0]?.source).toBe("paid");
  });
  it("only one overlapping scheduler claims a notice and accepted sends cannot replay", async () => {
    await collectFreeCreditResets(now);
    const row = (await creditResetCandidates(now))[0];
    expect(
      await Promise.all([claimCreditReset(row.id), claimCreditReset(row.id)]),
    ).toEqual([true, false]);
    expect((await creditResetCandidates(now, row.id, true)).length).toBe(1);
    await finishCreditReset(row.id, "accepted", now);
    expect(await claimCreditReset(row.id)).toBe(false);
  });
  it("enforces permission, unsubscribe, bounce, cooldown and experiment isolation at send time", async () => {
    await collectFreeCreditResets(now);
    expect((await creditResetCandidates(now)).length).toBe(1);
    await db.query('UPDATE "EngagementEmailPermission" SET allowed=FALSE');
    expect(await creditResetCandidates(now)).toEqual([]);
    await db.query(
      `UPDATE "EngagementEmailPermission" SET allowed=TRUE;INSERT INTO "VerificationToken" VALUES('email:reminders-unsubscribed:user','2030-01-01')`,
    );
    expect(await creditResetCandidates(now)).toEqual([]);
    await db.query(
      `TRUNCATE "VerificationToken";INSERT INTO "VerificationToken" VALUES('email:reminders-delivery-suppressed:user','2030-01-01')`,
    );
    expect(await creditResetCandidates(now)).toEqual([]);
    await db.query(
      `TRUNCATE "VerificationToken";INSERT INTO "EngagementEnrollment" VALUES('user','engagement-policy-v1')`,
    );
    expect(await creditResetCandidates(now)).toEqual([]);
    await db.query(
      `TRUNCATE "EngagementEnrollment";INSERT INTO "EngagementContact" VALUES('user','email','2026-10-31')`,
    );
    expect(await creditResetCandidates(now)).toEqual([]);
  });
});
