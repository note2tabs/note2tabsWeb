import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import Stripe from "stripe";
import { createMocks, createResponse } from "node-mocks-http";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ db: null as any, userId: "", stripe: { customers: { list: vi.fn(), retrieve: vi.fn() }, webhooks: null as any, invoices: { retrieve: vi.fn() }, subscriptions: { retrieve: vi.fn(), update: vi.fn(), list: vi.fn() }, coupons: { create: vi.fn() }, prices: { retrieve: vi.fn() } } }));
vi.mock("../../lib/prisma", () => ({ get prisma() { return m.db; } }));
vi.mock("../../lib/stripe", () => ({ stripeClient: m.stripe }));
vi.mock("next-auth/next", () => ({ getServerSession: async () => ({ user: { id: m.userId, email: "upgrade@example.test" } }) }));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("../../lib/posthogServer", () => ({ createPostHogServerClient: () => null }));
import webhook from "../../pages/api/stripe/webhook";
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
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_local_credit_upgrade");
    m.stripe.webhooks = new Stripe("sk_test_local_signature_only").webhooks;
    vi.stubEnv("STRIPE_PRICE_PREMIUM_MONTHLY", "price_premium");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro");
    vi.stubEnv("STRIPE_PRODUCT_PRO", "prod_pro");
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("CREDIT_UPGRADE_ENABLED", "true");
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
  async function deliver(type: string, object: unknown) {
    const payload = JSON.stringify({ id: `evt_test_${type}`, type, created: 100, data: { object } });
    const request = Readable.from([Buffer.from(payload)]) as any;
    request.method = "POST";
    request.headers = { "stripe-signature": m.stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_local_credit_upgrade" }) };
    const response = createResponse();
    await webhook(request, response as any);
    expect(response.statusCode, response._getData()).toBe(200);
  }
  it("handles early, duplicate and delayed signed events without extra grants or reverting Pro", async () => {
    const quote = await prepareCreditUpgrade(user.id, subscription(), "price_pro");
    m.stripe.subscriptions.update.mockResolvedValue(subscription({ pending_update: {}, latest_invoice: { ...invoice, status: "open" } }));
    await payCreditUpgrade(quote, quote.id);
    const early = upgraded(); early.latest_invoice = { ...invoice, status: "open" };
    m.stripe.subscriptions.retrieve.mockResolvedValue(early);
    await deliver("customer.subscription.updated", early);
    expect(await balance()).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).subscriptionPlan).toBe("PREMIUM");
    m.stripe.subscriptions.retrieve.mockResolvedValue(upgraded());
    await deliver("invoice.paid", { ...invoice, subscription: "sub_upgrade" });
    expect(await balance()).toBe(250);
    await db.$executeRaw`UPDATE user_credits SET credits=240 WHERE "userId"=${user.id}`;
    await db.user.update({where:{id:user.id},data:{tokensRemaining:240}});
    await deliver("invoice.paid", { ...invoice, subscription: "sub_upgrade" });
    await deliver("customer.subscription.updated", subscription());
    expect(await balance()).toBe(240);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).subscriptionPlan).toBe("PRO");
  });
  it("settles existing payments while new upgrade offers are disabled", async () => {
    const quote = await prepareCreditUpgrade(user.id, subscription(), "price_pro");
    m.stripe.subscriptions.update.mockResolvedValue(subscription({ pending_update: {}, latest_invoice: { ...invoice, status: "open" } }));
    await payCreditUpgrade(quote, quote.id);
    vi.stubEnv("CREDIT_UPGRADE_ENABLED", "false"); vi.stubEnv("CREDIT_UPGRADE_WEBHOOKS_ENABLED", "true");
    m.stripe.subscriptions.retrieve.mockResolvedValue(upgraded());
    await deliver("invoice.paid", { ...invoice, subscription: "sub_upgrade" });
    expect(await balance()).toBe(250);
  });
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
  it("retries an expired invoice with one new Stripe key across concurrent requests", async () => {
    const quote = await prepareCreditUpgrade(user.id, subscription(), "price_pro");
    m.stripe.subscriptions.update.mockResolvedValue(subscription({ pending_update: {}, latest_invoice: { ...invoice, status: "open" } }));
    await payCreditUpgrade(quote, quote.id);
    m.stripe.subscriptions.retrieve.mockResolvedValue(subscription({ latest_invoice: { ...invoice, id: "in_expired", status: "void" } }));
    m.stripe.subscriptions.update.mockResolvedValue(upgraded());
    m.stripe.subscriptions.update.mockClear();
    await Promise.all([payCreditUpgrade(quote, quote.id),payCreditUpgrade(quote, quote.id)]);
    const record = await db.creditUpgrade.findUniqueOrThrow({where:{id:quote.id}});
    expect(record).toMatchObject({attempt:1,lastVoidedInvoiceId:"in_expired"});
    expect(m.stripe.subscriptions.update.mock.calls.map(call=>call[2].idempotencyKey)).toEqual([`credit-upgrade-payment-${quote.id}-1`,`credit-upgrade-payment-${quote.id}-1`]);
    expect(await balance()).toBe(250);
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
  it.skipIf(process.env.CREDIT_UPGRADE_STRIPE_TEST !== "1")("runs real TEST-mode API, decline/retry, signed webhooks and full-price renewal", async () => {
    function cli(path: string, params: Record<string, unknown> = {}, method = "post", options: any = {}) {
      const args = [method, path, "--stripe-version", "2024-06-20"];
      if (method === "delete") args.push("--confirm");
      if (options.idempotencyKey) args.push("-i", options.idempotencyKey);
      const add = (key: string, value: unknown) => {
        if (value !== null && typeof value === "object") Object.entries(value).forEach(([k,v]) => add(`${key}[${k}]`,v));
        else args.push("-d", `${key}=${value}`);
      };
      Object.entries(params).forEach(([k,v]) => add(k,v));
      const result = JSON.parse(execFileSync("stripe", args, { encoding: "utf8", stdio: ["ignore","pipe","pipe"], timeout: 30000 }));
      if (result.error) throw Error(`${path}: ${result.error.message}`);
      if (result.livemode === true) throw Error("Live Stripe objects forbidden");
      return result;
    }
    const clock = cli("/v1/test_helpers/test_clocks", { frozen_time: Math.floor(Date.now()/1000), name: "Note2Tabs upgrade app end-to-end TEST" });
    const configKeys = ["STRIPE_PRICE_PREMIUM_MONTHLY","STRIPE_PRODUCT_PREMIUM","STRIPE_PRICE_PRO_MONTHLY","STRIPE_PRODUCT_PRO"];
    const previous = configKeys.map(key => process.env[key]);
    try {
      const customer = cli("/v1/customers", { email: user.email, test_clock: clock.id });
      const card = cli("/v1/payment_methods/pm_card_visa/attach", { customer: customer.id });
      const setCard = (id: string) => cli(`/v1/customers/${customer.id}`, { invoice_settings: { default_payment_method: id } });
      setCard(card.id);
      const price = (amount: number, name: string) => cli("/v1/prices", { currency: "usd", unit_amount: amount, recurring: { interval: "month" }, product_data: { name } });
      const premium = price(599,"TEST app Premium upgrade"), pro = price(1499,"TEST app Pro upgrade");
      [premium.id,premium.product,pro.id,pro.product].forEach((value,index) => vi.stubEnv(configKeys[index],value));
      const sub = cli("/v1/subscriptions", { customer: customer.id, items: [{ price: premium.id }] });
      m.stripe.customers.list.mockResolvedValue({data:[customer]});
      m.stripe.customers.retrieve.mockImplementation(async id => cli(`/v1/customers/${id}`,{},"get"));
      m.stripe.subscriptions.list.mockImplementation(async () => ({data:[cli(`/v1/subscriptions/${sub.id}`,{},"get")]}));
      m.stripe.subscriptions.retrieve.mockImplementation(async (id,params={}) => cli(`/v1/subscriptions/${id}`,params,"get"));
      m.stripe.subscriptions.update.mockImplementation(async (id,params,options) => cli(`/v1/subscriptions/${id}`,params,"post",options));
      m.stripe.invoices.retrieve.mockImplementation(async id => cli(`/v1/invoices/${id}`,{},"get"));
      m.stripe.prices.retrieve.mockImplementation(async (id,params={}) => cli(`/v1/prices/${id}`,params,"get"));
      m.stripe.coupons.create.mockImplementation(async (params,options) => cli("/v1/coupons",params,"post",options));
      const review = createMocks({method:"POST",body:{plan:"pro",action:"quote"}});
      await changePlan(review.req as any, review.res as any);
      expect(review.res._getJSONData().quote).toMatchObject({dueNow:301,credits:200});
      const decline = cli("/v1/payment_methods/pm_card_chargeCustomerFail/attach",{customer:customer.id}); setCard(decline.id);
      for (let attempt=0;attempt<2;attempt++) {
        const pay = createMocks({method:"POST",body:{plan:"pro",action:"confirm",quoteId:review.res._getJSONData().quote.id}});
        await changePlan(pay.req as any,pay.res as any);
        expect(pay.res._getJSONData()).toMatchObject({pending:true,changed:false});
        expect(await balance()).toBe(200);
      }
      let pending = cli(`/v1/subscriptions/${sub.id}`,{},"get");
      expect(pending.items.data[0].price.id).toBe(premium.id);
      const invoices = cli("/v1/invoices",{subscription:sub.id},"get");
      expect(invoices.data.filter((invoice:any)=>invoice.status === "open")).toHaveLength(1);
      const voidedId = pending.latest_invoice;
      cli(`/v1/invoices/${voidedId}/void`);
      const retry = createMocks({method:"POST",body:{plan:"pro",action:"confirm",quoteId:review.res._getJSONData().quote.id}});
      await changePlan(retry.req as any,retry.res as any);
      expect(retry.res._getJSONData()).toMatchObject({pending:true,changed:false});
      pending = cli(`/v1/subscriptions/${sub.id}`,{},"get");
      expect(pending.latest_invoice).not.toBe(voidedId);
      expect(cli("/v1/invoices",{subscription:sub.id},"get").data.filter((item:any)=>item.status === "open")).toHaveLength(1);
      setCard(card.id);
      const paid = cli(`/v1/invoices/${pending.latest_invoice}/pay`,{payment_method:card.id});
      expect(paid.amount_paid).toBe(301);
      await deliver("invoice.paid",paid);
      expect(await balance()).toBe(250);
      await db.$executeRaw`UPDATE user_credits SET credits=230 WHERE "userId"=${user.id}`;
      await db.user.update({where:{id:user.id},data:{tokensRemaining:230}});
      await deliver("invoice.paid",paid);
      await deliver("customer.subscription.updated",sub);
      expect(await balance()).toBe(230);
      expect((await db.user.findUniqueOrThrow({where:{id:user.id}})).subscriptionPlan).toBe("PRO");
      const active = cli(`/v1/subscriptions/${sub.id}`,{},"get");
      cli(`/v1/test_helpers/test_clocks/${clock.id}/advance`,{frozen_time:active.current_period_end+3600});
      let ready = false;
      for (let attempt=0;attempt<45;attempt++) {
        if (cli(`/v1/test_helpers/test_clocks/${clock.id}`,{},"get").status === "ready") {ready=true;break;}
        await new Promise(resolve => setTimeout(resolve,1000));
      }
      expect(ready).toBe(true);
      const renewed = cli(`/v1/subscriptions/${sub.id}`,{},"get");
      const renewalInvoice = cli(`/v1/invoices/${renewed.latest_invoice}`,{},"get");
      expect(renewalInvoice).toMatchObject({total:1499,status:"paid",billing_reason:"subscription_cycle"});
      await deliver("invoice.payment_succeeded",renewalInvoice);
      await deliver("invoice.payment_succeeded",renewalInvoice);
      expect((await db.user.findUniqueOrThrow({where:{id:user.id}})).tokensRemaining).toBe(480);
      cli(`/v1/products/${premium.product}`,{active:false}); cli(`/v1/products/${pro.product}`,{active:false});
    } finally {
      configKeys.forEach((key,index) => previous[index] === undefined ? delete process.env[key] : vi.stubEnv(key,previous[index]!));
      cli(`/v1/test_helpers/test_clocks/${clock.id}`,{},"delete");
    }
  },120000);

});
