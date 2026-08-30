import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks, createResponse } from "node-mocks-http";
import { PREMIUM_MONTHLY_CREDITS, STARTING_CREDITS } from "../../lib/credits";

const { sessionMock, stripeMock, prismaMock, posthogMock, sendEmailMock } = vi.hoisted(() => {
  return {
    sessionMock: vi.fn(),
    stripeMock: {
      checkout: {
        sessions: {
          create: vi.fn(),
          retrieve: vi.fn(),
          listLineItems: vi.fn(),
        },
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
      customers: {
        list: vi.fn(),
        retrieve: vi.fn(),
      },
      subscriptions: {
        list: vi.fn(),
        retrieve: vi.fn(),
        cancel: vi.fn(),
      },
      invoices: {
        retrieve: vi.fn(),
      },
      billingPortal: {
        sessions: {
          create: vi.fn(),
        },
      },
    },
    prismaMock: {
      affiliate: {
        findFirst: vi.fn(),
      },
      affiliateAttribution: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      affiliateCommission: {
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      tabJob: {
        groupBy: vi.fn(),
        deleteMany: vi.fn(),
      },
      canvases: {
        deleteMany: vi.fn(),
        findFirst: vi.fn(),
      },
      account: {
        deleteMany: vi.fn(),
      },
      session: {
        deleteMany: vi.fn(),
      },
      stripeRenewalInvoice: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      verificationToken: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    posthogMock: {
      capture: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    },
    sendEmailMock: vi.fn().mockResolvedValue(true),
  };
});

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../lib/stripe", () => ({
  stripeClient: stripeMock,
}));

vi.mock("../../lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../../lib/posthogServer", () => ({
  createPostHogServerClient: vi.fn(() => posthogMock),
  flushPostHogServerClientInBackground: vi.fn(),
}));

vi.mock("../../lib/email", () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

function buildWebhookReq(signature = "sig_test", body = "{}") {
  const req = new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  }) as any;
  req.method = "POST";
  req.headers = { "stripe-signature": signature };
  return req;
}

const premiumPrice = { id: "price_test_premium", product: "prod_note2tabs" };
const unrelatedPrice = { id: "price_other", product: "prod_other" };
const premiumSubscription = (overrides: Record<string, unknown> = {}) => ({
  id: "sub_premium",
  status: "active",
  customer: "cus_123",
  items: { data: [{ price: premiumPrice }] },
  ...overrides,
});
const premiumInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: "in_premium",
  billing_reason: "subscription_cycle",
  customer: "cus_123",
  customer_email: "user@example.com",
  subscription: "sub_premium",
  created: 1_700_000_000,
  period_end: 1_702_678_400,
  lines: {
    data: [
      {
        price: premiumPrice,
        subscription: "sub_premium",
        period: { start: 1_700_000_000, end: 1_702_678_400 },
      },
    ],
  },
  ...overrides,
});

describe("stripe premium flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_PREMIUM_MONTHLY = "price_test_premium";
    delete process.env.STRIPE_PRODUCT_PREMIUM;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    delete process.env.PREMIUM_TRIAL_REMINDER_MODE;
    process.env.NEXTAUTH_URL = "https://note2tabs.test";
    sessionMock.mockResolvedValue({
      user: { id: "user_1", email: "user@example.com" },
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.test/session_123",
    });
    stripeMock.checkout.sessions.retrieve.mockResolvedValue(null);
    stripeMock.checkout.sessions.listLineItems.mockResolvedValue({ data: [] });
    stripeMock.customers.list.mockResolvedValue({ data: [] });
    stripeMock.customers.retrieve.mockResolvedValue(null);
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.subscriptions.retrieve.mockImplementation((id: string) =>
      Promise.resolve(premiumSubscription({ id }))
    );
    stripeMock.subscriptions.cancel.mockResolvedValue({});
    stripeMock.invoices.retrieve.mockResolvedValue(premiumInvoice());
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      url: "https://billing.stripe.test/session_123",
    });
    prismaMock.tabJob.groupBy.mockResolvedValue([]);
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: "payment_intent.created",
      data: { object: {} },
    });
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.affiliate.findFirst.mockResolvedValue(null);
    prismaMock.affiliateAttribution.findUnique.mockResolvedValue(null);
    prismaMock.affiliateAttribution.findFirst.mockResolvedValue(null);
    prismaMock.affiliateCommission.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockImplementation(async () => {
      const session = await sessionMock();
      return { role: session?.user?.role || "FREE" };
    });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.user.delete.mockResolvedValue({});
    prismaMock.tabJob.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.canvases.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.canvases.findFirst.mockResolvedValue(null);
    prismaMock.account.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.stripeRenewalInvoice.findUnique.mockResolvedValue(null);
    prismaMock.stripeRenewalInvoice.findFirst.mockResolvedValue(null);
    prismaMock.stripeRenewalInvoice.create.mockResolvedValue({});
    prismaMock.verificationToken.create.mockResolvedValue({});
    prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)
    );
  });

  describe("create-checkout-session", () => {
    it("creates a checkout session with user metadata", async () => {
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: {
          source: "pricing_page",
          reason: "plan_comparison",
          funnelId: "funnel_test_123",
          offerVariant: "value_framing",
        },
        headers: {
          host: "note2tabs.test",
          "x-forwarded-proto": "https",
        },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        url: "https://checkout.stripe.test/session_123",
        checkoutAttemptId: "local",
        funnelId: "funnel_test_123",
        trialIncluded: true,
        offerVariant: "value_framing",
      });
      expect(posthogMock.capture).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "checkout_started",
        properties: expect.objectContaining({
          plan: "premium_monthly",
          source: "pricing_page",
          reason: "plan_comparison",
          funnel_id: "funnel_test_123",
          offer_variant: "value_framing",
          device_type: "desktop",
          $insert_id: "checkout-started:cs_test_123",
        }),
      });
      expect(posthogMock.flush).toHaveBeenCalled();
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: "user@example.com",
          mode: "subscription",
          payment_method_collection: "always",
          line_items: [{ price: "price_test_premium", quantity: 1 }],
          client_reference_id: "funnel_test_123",
          subscription_data: expect.objectContaining({
            trial_period_days: 7,
            metadata: expect.objectContaining({
              premiumFunnelId: "funnel_test_123",
              premiumFunnelSource: "pricing_page",
              premiumFunnelReason: "plan_comparison",
              premiumOfferVariant: "value_framing",
            }),
          }),
          metadata: expect.objectContaining({
            userId: "user_1",
            note2tabsPlan: "premium",
            note2tabsPriceId: "price_test_premium",
            premiumFunnelId: "funnel_test_123",
            premiumFunnelSource: "pricing_page",
            premiumFunnelReason: "plan_comparison",
            premiumOfferVariant: "value_framing",
          }),
          success_url:
            "https://note2tabs.test/settings?upgrade=success&session_id={CHECKOUT_SESSION_ID}",
          cancel_url: "https://note2tabs.test/settings?upgrade=cancel",
        }),
        expect.objectContaining({
          idempotencyKey: expect.stringMatching(/^premium-checkout-user_1-/),
        })
      );
    });

    it("applies an active referral promotion and persists first-touch attribution", async () => {
      const affiliate = {
        id: "aff_1",
        userId: "affiliate_owner",
        code: "PLAYER10",
        status: "ACTIVE",
        stripePromotionCodeId: "promo_affiliate_10",
      };
      const attribution = { id: "attr_1", affiliateId: affiliate.id, affiliate };
      prismaMock.affiliate.findFirst.mockResolvedValue(affiliate);
      prismaMock.affiliateAttribution.create.mockResolvedValue(attribution);
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { source: "pricing_page", reason: "plan_comparison" },
        cookies: { n2t_ref: "PLAYER10" },
        headers: { host: "note2tabs.test", "x-forwarded-proto": "https" },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.affiliateAttribution.create).toHaveBeenCalledWith({
        data: { affiliateId: "aff_1", referredUserId: "user_1", source: "link" },
        include: { affiliate: true },
      });
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discounts: [{ promotion_code: "promo_affiliate_10" }],
          metadata: expect.objectContaining({
            note2tabsAffiliateId: "aff_1",
            note2tabsAffiliateAttributionId: "attr_1",
          }),
          subscription_data: expect.objectContaining({
            metadata: expect.objectContaining({
              note2tabsAffiliateId: "aff_1",
              note2tabsAffiliateAttributionId: "attr_1",
            }),
          }),
        }),
        expect.any(Object)
      );
    });

    it("does not apply a deactivated affiliate to a future checkout", async () => {
      prismaMock.affiliate.findFirst.mockResolvedValue(null);
      prismaMock.affiliateAttribution.findUnique.mockResolvedValue({
        id: "attr_1",
        affiliateId: "aff_1",
        affiliate: {
          id: "aff_1",
          status: "DEACTIVATED",
          stripePromotionCodeId: "promo_affiliate_10",
        },
      });
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { source: "pricing_page", reason: "plan_comparison" },
        cookies: { n2t_ref: "PLAYER10" },
        headers: { host: "note2tabs.test", "x-forwarded-proto": "https" },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const checkoutInput = stripeMock.checkout.sessions.create.mock.calls.at(-1)?.[0];
      expect(checkoutInput).not.toHaveProperty("discounts");
      expect(checkoutInput.metadata).not.toHaveProperty("note2tabsAffiliateId");
      expect(checkoutInput.subscription_data.metadata).not.toHaveProperty("note2tabsAffiliateId");
    });

    it("returns 401 when unauthenticated", async () => {
      sessionMock.mockResolvedValue(null);
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(401);
    });

    it("records checkout creation failures without exposing Stripe details", async () => {
      stripeMock.checkout.sessions.create.mockRejectedValueOnce(
        new Error("Sensitive Stripe failure")
      );
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { source: "settings" },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData()).toEqual({ error: "Could not create checkout session." });
      expect(posthogMock.capture).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "checkout_failed",
        properties: expect.objectContaining({
          source: "settings",
          failure_stage: "stripe_session_creation",
        }),
      });
    });

    it("returns a preserved upload to the transcriber after checkout", async () => {
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { returnTo: "/transcribe?resumeTranscription=1" },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url:
            "https://note2tabs.test/transcribe?resumeTranscription=1&upgrade=success&session_id={CHECKOUT_SESSION_ID}",
          cancel_url: "https://note2tabs.test/transcribe?resumeTranscription=1&upgrade=cancel",
        }),
        expect.any(Object)
      );
    });

    it("adds the checkout session query before the homepage fragment", async () => {
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { returnTo: "/?resumeTranscription=1" },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url:
            "https://note2tabs.test/?resumeTranscription=1&upgrade=success&session_id={CHECKOUT_SESSION_ID}#hero",
        }),
        expect.any(Object)
      );
    });

    it("returns 503 when Stripe pricing is not configured", async () => {
      delete process.env.STRIPE_PRICE_PREMIUM_MONTHLY;
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(503);
    });

    it("does not create another checkout for an account with Premium access", async () => {
      sessionMock.mockResolvedValue({
        user: { id: "user_1", email: "user@example.com", role: "PREMIUM" },
      });
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(409);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("opens subscription management when Stripe already has an active Premium subscription", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_active", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [premiumSubscription({ id: "sub_active", status: "active" })],
      });
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        url: "https://billing.stripe.test/session_123",
        action: "manage_subscription",
      });
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("preserves the transcription return path when routing to subscription management", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_active", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [premiumSubscription({ id: "sub_active" })],
      });
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { returnTo: "/transcribe?resumeTranscription=1" },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: "cus_active",
        return_url:
          "https://note2tabs.test/transcribe?resumeTranscription=1&upgrade=manage",
      });
    });

    it("ignores unrelated same-email subscriptions when checking duplicates and trial history", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_other", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [
          {
            id: "sub_other",
            status: "active",
            trial_start: 1_700_000_000,
            items: { data: [{ price: unrelatedPrice }] },
          },
        ],
      });
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: "cus_other",
          subscription_data: expect.objectContaining({ trial_period_days: 7 }),
        }),
        expect.any(Object)
      );
    });

    it("recognizes a configured Premium product when its Stripe price was rotated", async () => {
      process.env.STRIPE_PRODUCT_PREMIUM = "prod_note2tabs";
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_legacy", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [
          premiumSubscription({
            id: "sub_legacy",
            items: {
              data: [{ price: { id: "price_legacy", product: "prod_note2tabs" } }],
            },
          }),
        ],
      });
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        url: "https://billing.stripe.test/session_123",
        action: "manage_subscription",
      });
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("does not grant a second trial after a previous trial ended", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_returning", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [
          premiumSubscription({
            id: "sub_canceled",
            status: "canceled",
            trial_start: 1_700_000_000,
          }),
        ],
      });
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const checkoutInput = stripeMock.checkout.sessions.create.mock.calls[0]?.[0];
      expect(checkoutInput).toEqual(expect.objectContaining({ customer: "cus_returning" }));
      expect(checkoutInput.subscription_data).not.toHaveProperty("trial_period_days");
      expect(checkoutInput.subscription_data).toEqual(
        expect.objectContaining({ metadata: expect.any(Object) })
      );
    });

    it("does not present a returning Premium subscriber as trial eligible", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_returning_paid", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [
          premiumSubscription({
            id: "sub_previous_paid",
            status: "canceled",
            trial_start: null,
            trial_end: null,
          }),
        ],
      });
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const checkoutInput = stripeMock.checkout.sessions.create.mock.calls[0]?.[0];
      expect(checkoutInput.subscription_data).not.toHaveProperty("trial_period_days");
    });

    it("replaces an incomplete Premium subscription with a fresh checkout", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_incomplete", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [premiumSubscription({ id: "sub_incomplete", status: "incomplete" })],
      });
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_incomplete");
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
      expect(stripeMock.checkout.sessions.create.mock.invocationCallOrder[0]).toBeLessThan(
        stripeMock.subscriptions.cancel.mock.invocationCallOrder[0]
      );
    });
  });

  describe("premium offer eligibility", () => {
    it("returns a trial only for accounts without previous Premium trial history", async () => {
      const handler = (await import("../../pages/api/stripe/offer-eligibility")).default;
      const eligible = createMocks({ method: "GET" });

      await handler(eligible.req as any, eligible.res as any);

      expect(eligible.res._getStatusCode()).toBe(200);
      expect(eligible.res._getJSONData()).toEqual({
        trialEligible: true,
        hasPremiumAccess: false,
      });

      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_returning", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [
          premiumSubscription({
            id: "sub_previous_trial",
            status: "canceled",
            trial_start: 1_700_000_000,
          }),
        ],
      });
      const returning = createMocks({ method: "GET" });

      await handler(returning.req as any, returning.res as any);

      expect(returning.res._getStatusCode()).toBe(200);
      expect(returning.res._getJSONData()).toEqual({
        trialEligible: false,
        hasPremiumAccess: false,
      });
    });
  });

  describe("create-portal-session", () => {
    it("returns a billing portal URL for an existing Stripe customer", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_123", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [premiumSubscription({ id: "sub_123" })],
      });
      const handler = (await import("../../pages/api/stripe/create-portal-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        headers: {
          host: "note2tabs.test",
          "x-forwarded-proto": "https",
        },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        url: "https://billing.stripe.test/session_123",
      });
      expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: "cus_123",
        return_url: "https://note2tabs.test/settings",
      });
    });

    it("supports a safe Home return path for payment recovery", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_123", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [premiumSubscription({ id: "sub_123", status: "past_due" })],
      });
      const handler = (await import("../../pages/api/stripe/create-portal-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { returnTo: "/home" },
        headers: { host: "note2tabs.test", "x-forwarded-proto": "https" },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: "cus_123",
        return_url: "https://note2tabs.test/home",
      });
    });

    it("does not accept an arbitrary portal return URL", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_123", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [premiumSubscription({ id: "sub_123" })],
      });
      const handler = (await import("../../pages/api/stripe/create-portal-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { returnTo: "https://attacker.example" },
        headers: { host: "note2tabs.test", "x-forwarded-proto": "https" },
      });

      await handler(req as any, res as any);

      expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: "cus_123",
        return_url: "https://note2tabs.test/settings",
      });
    });

    it("returns 404 when no Stripe customer exists for the account", async () => {
      stripeMock.customers.list.mockResolvedValue({ data: [] });
      const handler = (await import("../../pages/api/stripe/create-portal-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(404);
    });

    it("does not open a portal for an unrelated same-email product", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_other", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [
          {
            id: "sub_other",
            status: "active",
            items: { data: [{ price: unrelatedPrice }] },
          },
        ],
      });
      const handler = (await import("../../pages/api/stripe/create-portal-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(404);
      expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
    });
  });

  describe("account deletion", () => {
    it("cancels active Stripe subscriptions before deleting the account", async () => {
      sessionMock.mockResolvedValue({
        user: { id: "user_1", email: "user@example.com", role: "PREMIUM" },
      });
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_123", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [premiumSubscription({ id: "sub_123", status: "active" })],
      });
      const handler = (await import("../../pages/api/account/delete")).default;
      const { req, res } = createMocks({ method: "DELETE" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_123");
      expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: "user_1" } });
    });

    it("keeps the account when subscription cancellation fails", async () => {
      sessionMock.mockResolvedValue({
        user: { id: "user_1", email: "user@example.com", role: "PREMIUM" },
      });
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_123", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [premiumSubscription({ id: "sub_123", status: "active" })],
      });
      stripeMock.subscriptions.cancel.mockRejectedValue(new Error("Stripe unavailable"));
      const handler = (await import("../../pages/api/account/delete")).default;
      const { req, res } = createMocks({ method: "DELETE" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(500);
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
    });

    it("does not cancel unrelated same-email Stripe subscriptions during account deletion", async () => {
      sessionMock.mockResolvedValue({
        user: { id: "user_1", email: "user@example.com", role: "PREMIUM" },
      });
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_other", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [
          {
            id: "sub_other",
            status: "active",
            items: { data: [{ price: unrelatedPrice }] },
          },
        ],
      });
      const handler = (await import("../../pages/api/account/delete")).default;
      const { req, res } = createMocks({ method: "DELETE" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
      expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: "user_1" } });
    });
  });

  describe("confirm-checkout-session", () => {
    it("confirms an authenticated completed Premium checkout immediately", async () => {
      stripeMock.subscriptions.retrieve.mockResolvedValue(
        premiumSubscription({ status: "trialing" })
      );
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: "cs_123",
        mode: "subscription",
        status: "complete",
        metadata: {
          userId: "user_1",
          note2tabsPlan: "premium",
          note2tabsPriceId: "price_test_premium",
        },
        line_items: { data: [{ price: premiumPrice }] },
        subscription: premiumSubscription({ status: "trialing" }),
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: "user_1",
        role: "FREE",
        tokensRemaining: STARTING_CREDITS,
      });
      const handler = (await import("../../pages/api/stripe/confirm-checkout-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { sessionId: "cs_123" },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ confirmed: true, role: "PREMIUM" });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { role: "PREMIUM", tokensRemaining: PREMIUM_MONTHLY_CREDITS },
      });
    });

    it("rejects a completed checkout for an unrelated product", async () => {
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: "cs_other",
        mode: "subscription",
        status: "complete",
        metadata: { userId: "user_1" },
        line_items: { data: [{ price: unrelatedPrice }] },
        subscription: {
          ...premiumSubscription({ id: "sub_other" }),
          items: { data: [{ price: unrelatedPrice }] },
        },
      });
      const handler = (await import("../../pages/api/stripe/confirm-checkout-session")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { sessionId: "cs_other" },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(409);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });

  describe("stripe webhook", () => {
    it("upgrades FREE users to PREMIUM on checkout.session.completed", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_premium",
            mode: "subscription",
            client_reference_id: "funnel_webhook_123",
            metadata: {
              userId: "user_1",
              note2tabsPlan: "premium",
              note2tabsPriceId: "price_test_premium",
              premiumFunnelId: "funnel_webhook_123",
              premiumFunnelSource: "signed_home",
              premiumFunnelReason: "signed_home_value",
              premiumOfferVariant: "value_framing",
              premiumFunnelModel: "heavy",
              premiumTrialIncluded: "true",
            },
            subscription: premiumSubscription(),
            customer_details: { email: "user@example.com" },
          },
        },
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: "user_1",
        role: "FREE",
        tokensRemaining: STARTING_CREDITS,
      });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { id: "user_1" },
        select: { id: true, role: true, tokensRemaining: true },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { role: "PREMIUM", tokensRemaining: PREMIUM_MONTHLY_CREDITS },
      });
      expect(posthogMock.capture).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "subscription_started",
        properties: expect.objectContaining({
          source: "signed_home",
          reason: "signed_home_value",
          funnel_id: "funnel_webhook_123",
          trial_included: true,
          offer_variant: "value_framing",
          model: "heavy",
          event_source: "stripe_webhook",
          $insert_id: "subscription-started:cs_premium",
        }),
      });
    });

    it("sends an idempotent initial trial notice with billing terms in custom mode", async () => {
      process.env.PREMIUM_TRIAL_REMINDER_MODE = "custom";
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: "evt_checkout_trial",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_trial",
            mode: "subscription",
            metadata: {
              userId: "user_1",
              note2tabsPlan: "premium",
              note2tabsPriceId: "price_test_premium",
              premiumTrialIncluded: "true",
            },
            subscription: premiumSubscription({
              status: "trialing",
              created: 1_777_334_400,
              trial_start: 1_777_334_400,
              trial_end: 1_777_939_200,
            }),
            customer_details: { email: "user@example.com" },
          },
        },
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: "user_1",
        role: "FREE",
        tokensRemaining: STARTING_CREDITS,
      });
      prismaMock.user.findUnique.mockResolvedValue({
        email: "user@example.com",
        name: "Noel",
      });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();
      await handler(req as any, res as any);

      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          subject: "Your Note2Tabs Premium trial has started",
          text: expect.stringContaining("renews at $5.99 per month unless you cancel before then"),
        })
      );
      expect(prismaMock.verificationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          identifier: "notice:premium-trial-started:user_1",
          token: "stripe-event:evt_checkout_trial:trial-started",
        }),
      });
      expect(posthogMock.capture).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "subscription_trial_started_notice_sent",
        properties: expect.objectContaining({
          $insert_id: "subscription_trial_started_notice_sent:evt_checkout_trial",
        }),
      });
    });

    it("falls back to email lookup when checkout metadata does not include userId", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "subscription",
            metadata: {
              note2tabsPlan: "premium",
              note2tabsPriceId: "price_test_premium",
            },
            subscription: premiumSubscription(),
            customer_details: { email: "USER@EXAMPLE.COM" },
          },
        },
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: "user_1",
        role: "FREE",
        tokensRemaining: STARTING_CREDITS,
      });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
        select: { id: true, role: true, tokensRemaining: true },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { role: "PREMIUM", tokensRemaining: PREMIUM_MONTHLY_CREDITS },
      });
    });

    it("ignores an unrelated same-email checkout session", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_other",
            mode: "subscription",
            customer_details: { email: "user@example.com" },
            subscription: {
              ...premiumSubscription({ id: "sub_other" }),
              items: { data: [{ price: unrelatedPrice }] },
            },
          },
        },
      });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ received: true, ignored: "unrelated_checkout" });
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it("downgrades PREMIUM users to FREE on customer.subscription.deleted", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: premiumSubscription({ customer: "cus_123", status: "canceled" }),
        },
      });
      stripeMock.customers.retrieve.mockResolvedValue({
        id: "cus_123",
        email: "user@example.com",
      });
      prismaMock.user.findFirst.mockResolvedValue({ id: "user_1", role: "PREMIUM" });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { role: "FREE", tokensRemaining: STARTING_CREDITS },
      });
    });

    it("does not downgrade when another Stripe customer for the same email has an active subscription", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: premiumSubscription({ customer: "cus_canceled", status: "canceled" }),
        },
      });
      stripeMock.customers.retrieve.mockResolvedValue({
        id: "cus_canceled",
        email: "user@example.com",
      });
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_active", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockImplementation(({ customer }: { customer: string }) =>
        Promise.resolve({
          data:
            customer === "cus_active"
              ? [premiumSubscription({ id: "sub_active", customer: "cus_active" })]
              : [],
        })
      );

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it("adds monthly credits on renewal invoices without exceeding the rollover cap", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: {
          object: premiumInvoice({
            id: "in_renewal_1",
          }),
        },
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: "user_1",
        role: "PREMIUM",
        tokensRemaining: 150,
      });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: {
          role: "PREMIUM",
          tokensRemaining: 200,
        },
      });
      expect(prismaMock.stripeRenewalInvoice.create).toHaveBeenCalledWith({
        data: {
          invoiceId: "in_renewal_1",
          userId: "user_1",
          stripeSubscriptionId: "sub_premium",
          renewalAt: new Date("2023-12-15T22:13:20.000Z"),
          granted: true,
        },
      });
    });

    it("does not grant renewal credits twice for the same Stripe invoice", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: {
          object: premiumInvoice({
            id: "in_renewal_1",
          }),
        },
      });
      prismaMock.stripeRenewalInvoice.findUnique.mockResolvedValue({
        invoiceId: "in_renewal_1",
      });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it("records but does not grant a distinct out-of-order renewal invoice", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: { object: premiumInvoice({ id: "in_older" }) },
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: "user_1",
        role: "PREMIUM",
        tokensRemaining: 30,
      });
      prismaMock.stripeRenewalInvoice.findFirst.mockResolvedValue({
        renewalAt: new Date("2024-01-15T00:00:00.000Z"),
      });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ received: true, renewal: "out_of_order" });
      expect(prismaMock.stripeRenewalInvoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId: "in_older",
          userId: "user_1",
          granted: false,
        }),
      });
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it("ignores renewal invoices for an unrelated same-email product", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: {
          object: premiumInvoice({
            id: "in_other",
            subscription: "sub_other",
            lines: {
              data: [
                {
                  price: unrelatedPrice,
                  subscription: "sub_other",
                  period: { start: 1_700_000_000, end: 1_702_678_400 },
                },
              ],
            },
          }),
        },
      });
      stripeMock.subscriptions.retrieve.mockResolvedValue({
        ...premiumSubscription({ id: "sub_other" }),
        items: { data: [{ price: unrelatedPrice }] },
      });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ received: true, ignored: "unrelated_invoice" });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it("ignores a stale renewal success after the subscription is no longer entitled", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: {
          object: premiumInvoice({
            id: "in_stale",
            customer: "cus_canceled",
          }),
        },
      });
      stripeMock.subscriptions.retrieve.mockResolvedValue(
        premiumSubscription({ id: "sub_premium", status: "canceled", customer: "cus_canceled" })
      );

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it("tracks a scheduled trial cancellation with Stripe cancellation context", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: "evt_cancel_scheduled",
        type: "customer.subscription.updated",
        data: {
          previous_attributes: { cancel_at_period_end: false },
          object: premiumSubscription({
            status: "trialing",
            cancel_at_period_end: true,
            trial_end: Math.floor(Date.now() / 1000) + 3 * 86_400,
            cancellation_details: { reason: "cancellation_requested", feedback: "too_expensive" },
          }),
        },
      });
      stripeMock.customers.retrieve.mockResolvedValue({
        id: "cus_123",
        email: "user@example.com",
      });
      prismaMock.user.findFirst
        .mockResolvedValueOnce({ id: "user_1" })
        .mockResolvedValueOnce({ id: "user_1", role: "PREMIUM", tokensRemaining: 50 });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(posthogMock.capture).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "subscription_cancel_scheduled",
        properties: expect.objectContaining({
          trial: true,
          cancellation_feedback: "too_expensive",
          $insert_id: "subscription_cancel_scheduled:evt_cancel_scheduled",
        }),
      });
    });

    it("attributes lifecycle events from subscription metadata when the Stripe email changed", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: "evt_cancel_metadata",
        type: "customer.subscription.updated",
        data: {
          previous_attributes: { cancel_at_period_end: false },
          object: premiumSubscription({
            status: "trialing",
            metadata: { userId: "user_metadata" },
            cancel_at_period_end: true,
            trial_end: Math.floor(Date.now() / 1000) + 3 * 86_400,
          }),
        },
      });
      stripeMock.customers.retrieve.mockResolvedValue({
        id: "cus_123",
        email: "old-address@example.com",
      });
      prismaMock.user.findUnique.mockResolvedValue({ id: "user_metadata" });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(posthogMock.capture).toHaveBeenCalledWith({
        distinctId: "user_metadata",
        event: "subscription_cancel_scheduled",
        properties: expect.objectContaining({
          $insert_id: "subscription_cancel_scheduled:evt_cancel_metadata",
        }),
      });
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "user_metadata" } })
      );
    });

    it("tracks the Stripe trial-ending lifecycle event", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: "evt_trial_ending",
        type: "customer.subscription.trial_will_end",
        data: {
          object: premiumSubscription({
            status: "trialing",
            trial_end: Math.floor(Date.now() / 1000) + 3 * 86_400,
            cancel_at_period_end: false,
          }),
        },
      });
      stripeMock.customers.retrieve.mockResolvedValue({
        id: "cus_123",
        email: "user@example.com",
      });
      prismaMock.user.findFirst.mockResolvedValue({ id: "user_1" });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(posthogMock.capture).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "subscription_trial_ending",
        properties: expect.objectContaining({
          cancel_at_period_end: false,
          $insert_id: "subscription_trial_ending:evt_trial_ending",
        }),
      });
    });

    it("sends one custom trial reminder to the latest tab when explicitly enabled", async () => {
      process.env.PREMIUM_TRIAL_REMINDER_MODE = "custom";
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: "evt_trial_reminder",
        type: "customer.subscription.trial_will_end",
        data: {
          object: premiumSubscription({
            status: "trialing",
            trial_end: 1_800_000_000,
            cancel_at_period_end: false,
          }),
        },
      });
      stripeMock.customers.retrieve.mockResolvedValue({
        id: "cus_123",
        email: "user@example.com",
      });
      prismaMock.user.findFirst.mockResolvedValue({ id: "user_1" });
      prismaMock.user.findUnique.mockResolvedValue({ name: "Noel" });
      prismaMock.canvases.findFirst.mockResolvedValue({
        canvas_id: "editor_123",
        name: "Autumn Fall",
      });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();
      await handler(req as any, res as any);

      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          subject: expect.stringContaining("Your Note2Tabs trial ends"),
          text: expect.stringContaining("/gte/editor_123?mode=practice&source=trial_reminder"),
        })
      );
      expect(prismaMock.verificationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          identifier: "reminder:premium-trial:user_1",
          token: "stripe-event:evt_trial_reminder",
        }),
      });
      expect(posthogMock.capture).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "subscription_trial_reminder_sent",
        properties: expect.objectContaining({
          destination: "latest_editor_practice",
          $insert_id: "subscription_trial_reminder_sent:evt_trial_reminder",
        }),
      });
    });

    it("does not resend a custom trial reminder for the same Stripe event", async () => {
      process.env.PREMIUM_TRIAL_REMINDER_MODE = "custom";
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: "evt_trial_duplicate",
        type: "customer.subscription.trial_will_end",
        data: {
          object: premiumSubscription({
            status: "trialing",
            trial_end: 1_800_000_000,
            cancel_at_period_end: false,
          }),
        },
      });
      stripeMock.customers.retrieve.mockResolvedValue({
        id: "cus_123",
        email: "user@example.com",
      });
      prismaMock.user.findFirst.mockResolvedValue({ id: "user_1" });
      prismaMock.verificationToken.create.mockRejectedValue({ code: "P2002" });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("tracks failed Premium renewal payments without exposing customer details", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: "evt_payment_failed",
        type: "invoice.payment_failed",
        data: { object: premiumInvoice({ attempt_count: 2 }) },
      });
      prismaMock.user.findFirst.mockResolvedValue({ id: "user_1" });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(posthogMock.capture).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "subscription_payment_failed",
        properties: expect.objectContaining({
          attempt_count: 2,
          $insert_id: "subscription_payment_failed:evt_payment_failed",
        }),
      });
    });

    it("sends one payment recovery notice on the first failed attempt", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: "evt_payment_failed_first",
        type: "invoice.payment_failed",
        data: { object: premiumInvoice({ attempt_count: 1 }) },
      });
      prismaMock.user.findFirst.mockResolvedValue({ id: "user_1" });
      prismaMock.user.findUnique.mockResolvedValue({ id: "user_1", name: "Noel" });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          subject: "Please update your Note2Tabs payment method",
          text: expect.stringContaining("14-day recovery period"),
        })
      );
      expect(prismaMock.verificationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          identifier: "notice:premium-payment-failed:user_1",
          token: "stripe-invoice:in_premium",
        }),
      });
    });
  });

  describe("subscription status", () => {
    it("returns the authenticated user's trial and cancellation timing", async () => {
      const now = Math.floor(Date.now() / 1000);
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_123", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [
          premiumSubscription({
            created: now - 86_400,
            status: "trialing",
            trial_end: now + 3 * 86_400,
            current_period_end: now + 3 * 86_400,
            cancel_at_period_end: true,
          }),
        ],
      });

      const handler = (await import("../../pages/api/stripe/subscription-status")).default;
      const { req, res } = createMocks({ method: "GET" });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getHeaders()["cache-control"]).toBe("private, no-store");
      expect(res._getJSONData()).toEqual({
        subscription: expect.objectContaining({
          status: "trialing",
          isTrial: true,
          cancelAtPeriodEnd: true,
        }),
      });
    });

    it("does not expose an unrelated Stripe product", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_123", email: "user@example.com" }],
      });
      stripeMock.subscriptions.list.mockResolvedValue({
        data: [
          {
            ...premiumSubscription(),
            items: { data: [{ price: unrelatedPrice }] },
          },
        ],
      });

      const handler = (await import("../../pages/api/stripe/subscription-status")).default;
      const { req, res } = createMocks({ method: "GET" });
      await handler(req as any, res as any);

      expect(res._getJSONData()).toEqual({ subscription: null });
    });
  });
});
