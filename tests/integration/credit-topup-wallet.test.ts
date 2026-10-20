/** Disposable PostgreSQL only. No Stripe calls or production database access. */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const m = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../lib/prisma", () => ({
  get prisma() {
    return m.db;
  },
}));
import { fulfillCreditTopUp } from "../../lib/creditTopUps";
import {
  walletCredits,
  grantWalletAllowance,
  lockCreditWallet,
  usesCreditWallet,
  activateWalletPlan,
} from "../../lib/creditWallet";
const url = process.env.CREDIT_TOPUP_TEST_DATABASE_URL;
describe.skipIf(!url)("one combined credit wallet", () => {
  let db: PrismaClient, user: any, order: any;
  const summary = {
    used: 0,
    limit: 10,
    remaining: 10,
    unlimited: false,
    resetAt: "2026-11-01T00:00:00Z",
  };
  const session = (refunded = 0) =>
    ({
      id: "cs_test_topup",
      mode: "payment",
      payment_status: "paid",
      client_reference_id: user.id,
      currency: "usd",
      amount_total: 249,
      metadata: { creditTopUpOrderId: order.id },
      payment_intent: {
        id: "pi_test",
        latest_charge: { amount_refunded: refunded },
      },
    }) as any;
  const balance = async () =>
    (
      await db.$queryRaw<
        Array<{ credits: number }>
      >`SELECT credits FROM user_credits WHERE "userId"=${user.id}`
    )[0].credits;
  beforeAll(() => {
    const parsed = new URL(url!);
    if (
      !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
      parsed.pathname !== "/n2t_credit_topup_test"
    )
      throw Error("Isolated local database required");
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    m.db = db;
  });
  beforeEach(async () => {
    await db.creditTopUpOrder.deleteMany();
    await db.creditWalletState.deleteMany();
    await db.$executeRaw`DELETE FROM user_credits`;
    await db.user.deleteMany();
    user = await db.user.create({
      data: {
        email: "topup@example.test",
        role: "FREE",
        subscriptionPlan: "FREE",
        tokensRemaining: 10,
      },
    });
    order = await db.creditTopUpOrder.create({
      data: {
        userId: user.id,
        credits: 30,
        amountCents: 249,
        checkoutSessionId: "cs_test_topup",
      },
    });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it("grants once across concurrent deliveries and preserves Free access", async () => {
    await Promise.all(
      Array.from({ length: 8 }, () => fulfillCreditTopUp(session())),
    );
    expect(await balance()).toBe(40);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).role,
    ).toBe("FREE");
  });
  it("does not fulfill pending or mismatched payments", async () => {
    await fulfillCreditTopUp({ ...session(), payment_status: "unpaid" });
    expect(
      (await db.creditTopUpOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .fulfilled,
    ).toBe(false);
    await expect(
      fulfillCreditTopUp({ ...session(), amount_total: 149 }),
    ).rejects.toThrow();
  });
  it("retains wallet authority when new purchases are disabled", async () => {
    vi.stubEnv("CREDIT_TOPUPS_ENABLED", "false");
    expect(await usesCreditWallet(user.id)).toBe(false);
    await fulfillCreditTopUp(session());
    expect(await usesCreditWallet(user.id)).toBe(true);
    expect((await walletCredits(user, summary)).remaining).toBe(40);
  });
  it("uses backend debits without restoring spent purchased credits", async () => {
    await fulfillCreditTopUp(session());
    await db.$executeRaw`UPDATE user_credits SET credits=credits-12 WHERE "userId"=${user.id}`;
    expect((await walletCredits(user, summary)).remaining).toBe(28);
    expect((await walletCredits(user, summary)).remaining).toBe(28);
  });
  it("preserves purchased credits at free reset and tops up only to 10", async () => {
    await fulfillCreditTopUp(session());
    await db.$transaction((tx) =>
      lockCreditWallet(tx, user, 10, new Date("2027-01-01")),
    );
    expect(await balance()).toBe(40);
    await db.$executeRaw`UPDATE user_credits SET credits=2 WHERE "userId"=${user.id}`;
    await db.$transaction((tx) =>
      lockCreditWallet(tx, user, 10, new Date("2027-02-01")),
    );
    expect(await balance()).toBe(10);
  });
  it("serializes duplicate activation against the same balance", async () => {
    await fulfillCreditTopUp(session());
    await Promise.all(
      Array.from({ length: 5 }, () =>
        activateWalletPlan(user, "PREMIUM", 100, 200),
      ),
    );
    expect(await balance()).toBe(140);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .subscriptionPlan,
    ).toBe("PREMIUM");
  });
  it("keeps a paid wallet above rollover cap and grants nothing until it falls below", async () => {
    await fulfillCreditTopUp(session());
    await db.$executeRaw`UPDATE user_credits SET credits=400 WHERE "userId"=${user.id}`;
    expect(
      await db.$transaction((tx) =>
        grantWalletAllowance(
          tx,
          { ...user, role: "PREMIUM", subscriptionPlan: "PREMIUM" },
          100,
          200,
        ),
      ),
    ).toBe(400);
    expect(await balance()).toBe(400);
  });
  it("reconciles partial/full refunds idempotently including reordered events", async () => {
    await fulfillCreditTopUp(session(100));
    expect(await balance()).toBe(28);
    await fulfillCreditTopUp(session(100));
    expect(await balance()).toBe(28);
    await fulfillCreditTopUp(session(249));
    expect(await balance()).toBe(10);
    await fulfillCreditTopUp(session());
    expect(await balance()).toBe(10);
  });
});
