import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks, createResponse } from "node-mocks-http";
import { PREMIUM_MONTHLY_CREDITS, STARTING_CREDITS } from "../../lib/credits";

const { sessionMock, stripeMock, prismaMock } = vi.hoisted(() => {
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
      billingPortal: {
        sessions: {
          create: vi.fn(),
        },
      },
    },
    prismaMock: {
      user: {
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      tabJob: {
        groupBy: vi.fn(),
        deleteMany: vi.fn(),
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
      $transaction: vi.fn(),
    },
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
    process.env.NEXTAUTH_URL = "https://note2tabs.test";
    sessionMock.mockResolvedValue({
      user: { id: "user_1", email: "user@example.com" },
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({
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
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      url: "https://billing.stripe.test/session_123",
    });
    prismaMock.tabJob.groupBy.mockResolvedValue([]);
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: "payment_intent.created",
      data: { object: {} },
    });
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.user.delete.mockResolvedValue({});
    prismaMock.tabJob.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.account.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.stripeRenewalInvoice.findUnique.mockResolvedValue(null);
    prismaMock.stripeRenewalInvoice.findFirst.mockResolvedValue(null);
    prismaMock.stripeRenewalInvoice.create.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)
    );
  });

  describe("create-checkout-session", () => {
    it("creates a checkout session with user metadata", async () => {
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
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
        url: "https://checkout.stripe.test/session_123",
      });
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: "user@example.com",
          mode: "subscription",
          payment_method_collection: "always",
          line_items: [{ price: "price_test_premium", quantity: 1 }],
          subscription_data: { trial_period_days: 7 },
          metadata: {
            userId: "user_1",
            note2tabsPlan: "premium",
            note2tabsPriceId: "price_test_premium",
          },
          success_url:
            "https://note2tabs.test/settings?upgrade=success&session_id={CHECKOUT_SESSION_ID}",
          cancel_url: "https://note2tabs.test/settings?upgrade=cancel",
        }),
        expect.objectContaining({
          idempotencyKey: expect.stringMatching(/^premium-checkout-user_1-/),
        })
      );
    });

    it("returns 401 when unauthenticated", async () => {
      sessionMock.mockResolvedValue(null);
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(401);
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
          subscription_data: { trial_period_days: 7 },
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
      expect(checkoutInput).not.toHaveProperty("subscription_data");
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
            mode: "subscription",
            metadata: {
              userId: "user_1",
              note2tabsPlan: "premium",
              note2tabsPriceId: "price_test_premium",
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
        tokensRemaining: 80,
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
          tokensRemaining: 100,
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
  });
});
