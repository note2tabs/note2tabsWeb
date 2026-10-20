import { createMocks } from "node-mocks-http";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ db: null as any, userId: "", stripe: { customers: { list: vi.fn() }, invoices: { retrieve: vi.fn() }, subscriptions: { retrieve: vi.fn(), update: vi.fn(), list: vi.fn() }, coupons: { create: vi.fn() }, prices: { retrieve: vi.fn() } } }));
vi.mock("../../lib/prisma", () => ({ get prisma() { return m.db; } }));
vi.mock("../../lib/stripe", () => ({ stripeClient: m.stripe }));
vi.mock("next-auth/next", () => ({ getServerSession: async () => ({ user: { id: m.userId, email: "upgrade@example.test" } }) }));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("../../lib/posthogServer", () => ({ createPostHogServerClient: () => null }));
import changePlan from "../../pages/api/stripe/change-plan";
import { prepareCreditUpgrade, payCreditUpgrade, applyCreditUpgrade } from "../../lib/creditUpgrade";
const url = process.env.CREDIT_UPGRADE_TEST_DATABASE_URL;
describe.skipIf(!url)("credit upgrade with real isolated PostgreSQL", () => {
  let db: PrismaClient, user: any;
  const invoice: any = { id: "in_upgrade", status: "paid", billing_reason: "subscription_update", hosted_invoice_url: "https://invoice.stripe.com/test" };
  const subscription = (overrides: any = {}) => ({ id: "sub_upgrade", status: "active", currency: "usd", collection_method: "charge_automatically", current_period_start: 100, latest_invoice: { id: "in_old", status: "paid" }, items: { data: [{ id: "si_1", price: { id: "price_premium", recurring: { interval: "month" } }, quantity: 1 }] }, ...overrides }) as any;
  const upgraded = () => subscription({ current_period_start: 100, latest_invoice: invoice, items: { data: [{ id: "si_1", price: { id: "price_pro" } }] } });
  const balance = async () => (await db.$queryRaw<Array<{ credits: number }>>`SELECT credits FROM user_credits WHERE "userId"=${user.id}`)[0].credits;
  beforeAll(() => {
    const parsed = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.pathname !== "/n2t_upgrade_test") throw Error("Disposable local database required");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) }); m.db = db;
    vi.stubEnv("CREDIT_UPGRADE_ENABLED", "true");
    vi.stubEnv("PRO_PLAN_ENABLED", "true");
    vi.stubEnv("STRIPE_PRICE_PREMIUM_MONTHLY", "price_premium");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro");
    vi.stubEnv("STRIPE_PRODUCT_PRO", "prod_pro");
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.creditUpgrade.deleteMany(); await db.$executeRaw`DELETE FROM user_credits`; await db.user.deleteMany();
    user = await db.user.create({ data: { email: "upgrade@example.test", role: "PREMIUM", subscriptionPlan: "PREMIUM", tokensRemaining: 190 } });
    m.userId = user.id;
    m.stripe.customers.list.mockResolvedValue({ data: [{ id: "cus_test" }] });
    m.stripe.subscriptions.list.mockResolvedValue({ data: [subscription()] });
    await db.$executeRaw`INSERT INTO user_credits ("userId", credits) VALUES (${user.id},200)`;
    m.stripe.prices.retrieve.mockImplementation(async (id: string) => ({ id, active: true, currency: "usd", unit_amount: id === "price_pro" ? 1499 : 599, recurring: { interval: "month" } }));
    m.stripe.subscriptions.retrieve.mockResolvedValue(subscription());
    m.stripe.subscriptions.update.mockResolvedValue(upgraded());
    invoice.discount = null;
    m.stripe.coupons.create.mockImplementation(async (params: any) => {
      invoice.discount = { coupon: { metadata: params.metadata } };
      return { id: "coupon_once" };
    });
  });
  afterAll(async () => { await db?.$disconnect(); vi.unstubAllEnvs(); });
  it("round trips the actual authenticated API from quote to confirmed upgrade", async () => {
    const first = createMocks({ method: "POST", body: { plan: "pro", billingInterval: "monthly" } });
    await changePlan(first.req as any, first.res as any);
    expect(first.res.statusCode).toBe(200);
    expect(first.res._getJSONData().quote).toMatchObject({ dueNow: 301, credits: 200 });
    expect(m.stripe.subscriptions.update).not.toHaveBeenCalled();
    const second = createMocks({ method: "POST", body: { plan: "pro", billingInterval: "monthly", action: "confirm", quoteId: first.res._getJSONData().quote.id } });
    await changePlan(second.req as any, second.res as any);
    expect(second.res._getJSONData()).toMatchObject({ changed: true, plan: "pro" });
    expect(await balance()).toBe(250);
  });
  it("leaves the annual upgrade path unchanged", async () => {
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", "price_pro_year");
    const request = createMocks({ method: "POST", body: { plan: "pro", billingInterval: "yearly" } });
    await changePlan(request.req as any, request.res as any);
    expect(request.res.statusCode).toBe(200);
    expect(m.stripe.subscriptions.update).toHaveBeenCalledWith("sub_upgrade", expect.objectContaining({ proration_behavior: "always_invoice" }));
    expect(await db.creditUpgrade.count()).toBe(0);
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", "");
  });
  it("refuses to exchange credits against an unrelated paid invoice", async () => {
    const quote = await prepareCreditUpgrade(user.id, subscription(), "price_pro");
    m.stripe.subscriptions.update.mockResolvedValue(subscription({ pending_update: {}, latest_invoice: { ...invoice, status: "open" } }));
    await payCreditUpgrade(quote, quote.id);
    invoice.discount = null;
    await expect(applyCreditUpgrade(upgraded(), invoice)).rejects.toThrow("confirmed credit exchange");
    expect(await balance()).toBe(200);
  });
  it("uses the existing subscription currency including zero-decimal prices", async () => {
    m.stripe.prices.retrieve.mockImplementation(async (id: string) => ({ active: true, currency: "usd", unit_amount: id === "price_pro" ? 1499 : 599, currency_options: { jpy: { unit_amount: id === "price_pro" ? 1500 : 600 } }, recurring: { interval: "month" } }));
    expect(await prepareCreditUpgrade(user.id, subscription({ currency: "jpy" }), "price_pro")).toMatchObject({ currency: "jpy", discount: 1200, regularAmount: 1500 });
  });
  it("rejects an old API quote after credits have been spent", async () => {
    const first = createMocks({ method: "POST", body: { plan: "pro" } });
    await changePlan(first.req as any, first.res as any);
    await db.$executeRaw`UPDATE user_credits SET credits=170 WHERE "userId"=${user.id}`;
    const second = createMocks({ method: "POST", body: { plan: "pro", action: "confirm", quoteId: first.res._getJSONData().quote.id } });
    await changePlan(second.req as any, second.res as any);
    expect(second.res.statusCode).toBe(409);
    expect(m.stripe.subscriptions.update).not.toHaveBeenCalled();
  });
  it("quotes authoritative rollover balance without charging or mutating credits", async () => {
    const quote = await prepareCreditUpgrade(user.id, subscription(), "price_pro");
    expect(quote).toMatchObject({ credits: 200, discount: 1198, regularAmount: 1499 });
    expect(await balance()).toBe(200); expect(m.stripe.subscriptions.update).not.toHaveBeenCalled();
  });
  it("rejects stale confirmation before any billing operation", async () => {
    const quote = await prepareCreditUpgrade(user.id, subscription(), "price_pro");
    await expect(payCreditUpgrade(quote, "wrong")).rejects.toThrow("balance changed");
    expect(m.stripe.coupons.create).not.toHaveBeenCalled();
  });
  it("creates a one-invoice discount and full monthly renewal without time proration", async () => {
    const quote = await prepareCreditUpgrade(user.id, subscription(), "price_pro");
    expect(await payCreditUpgrade(quote, quote.id)).toMatchObject({ changed: true });
    expect(m.stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 1198, duration: "once" }), expect.anything());
    expect(m.stripe.subscriptions.update).toHaveBeenCalledWith("sub_upgrade", expect.objectContaining({ billing_cycle_anchor: "now", proration_behavior: "none", payment_behavior: "pending_if_incomplete" }), expect.anything());
    expect(await balance()).toBe(250);
  });
  it("does not grant Pro while payment is pending, and returns Stripe authentication page", async () => {
    const quote = await prepareCreditUpgrade(user.id, subscription(), "price_pro");
    m.stripe.subscriptions.update.mockResolvedValue(subscription({ pending_update: { expires_at: 500 }, latest_invoice: { ...invoice, status: "open" } }));
    expect(await payCreditUpgrade(quote, quote.id)).toMatchObject({ changed: false, pending: true, url: invoice.hosted_invoice_url });
    expect(await balance()).toBe(200); expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).subscriptionPlan).toBe("PREMIUM");
  });
  it("adjusts spending while payment is pending, grants once under concurrent webhooks", async () => {
    const quote = await prepareCreditUpgrade(user.id, subscription(), "price_pro");
    m.stripe.subscriptions.update.mockResolvedValue(subscription({ pending_update: {}, latest_invoice: { ...invoice, status: "open" } }));
    await payCreditUpgrade(quote, quote.id);
    await db.$executeRaw`UPDATE user_credits SET credits=170 WHERE "userId"=${user.id}`;
    await Promise.all(Array.from({ length: 8 }, () => applyCreditUpgrade(upgraded(), invoice as any)));
    expect(await balance()).toBe(220);
    await db.$executeRaw`UPDATE user_credits SET credits=210 WHERE "userId"=${user.id}`;
    await applyCreditUpgrade(upgraded(), invoice as any);
    expect(await balance()).toBe(210);
  });
  it.each([{ status: "past_due" }, { schedule: "sched_1" }, { pending_update: {} }])("rejects subscriptions requiring review: %s", async overrides => {
    await expect(prepareCreditUpgrade(user.id, subscription(overrides), "price_pro")).rejects.toThrow();
  });
});
