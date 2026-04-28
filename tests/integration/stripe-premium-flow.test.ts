import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks, createResponse } from "node-mocks-http";
import { STARTING_CREDITS } from "../../lib/credits";

const { sessionMock, stripeMock, prismaMock } = vi.hoisted(() => {
  return {
    sessionMock: vi.fn(),
    stripeMock: {
      checkout: {
        sessions: {
          create: vi.fn(),
        },
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
      customers: {
        list: vi.fn(),
        retrieve: vi.fn(),
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
      },
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

describe("stripe premium flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_PREMIUM_MONTHLY = "price_test_premium";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    sessionMock.mockResolvedValue({
      user: { id: "user_1", email: "user@example.com" },
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      url: "https://checkout.stripe.test/session_123",
    });
    stripeMock.customers.list.mockResolvedValue({ data: [] });
    stripeMock.customers.retrieve.mockResolvedValue(null);
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      url: "https://billing.stripe.test/session_123",
    });
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: "payment_intent.created",
      data: { object: {} },
    });
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.update.mockResolvedValue({});
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
          metadata: { userId: "user_1" },
          success_url: "https://note2tabs.test/settings?upgrade=success",
          cancel_url: "https://note2tabs.test/settings?upgrade=cancel",
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

    it("returns 503 when Stripe pricing is not configured", async () => {
      delete process.env.STRIPE_PRICE_PREMIUM_MONTHLY;
      const handler = (await import("../../pages/api/stripe/create-checkout-session")).default;
      const { req, res } = createMocks({ method: "POST" });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(503);
    });
  });

  describe("create-portal-session", () => {
    it("returns a billing portal URL for an existing Stripe customer", async () => {
      stripeMock.customers.list.mockResolvedValue({
        data: [{ id: "cus_123", email: "user@example.com" }],
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
  });

  describe("stripe webhook", () => {
    it("upgrades FREE users to PREMIUM on checkout.session.completed", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { userId: "user_1" },
            customer_details: { email: "user@example.com" },
          },
        },
      });
      prismaMock.user.findFirst.mockResolvedValue({ id: "user_1", role: "FREE" });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { id: "user_1" },
        select: { id: true, role: true },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { role: "PREMIUM", tokensRemaining: 99999 },
      });
    });

    it("falls back to email lookup when checkout metadata does not include userId", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            customer_details: { email: "USER@EXAMPLE.COM" },
          },
        },
      });
      prismaMock.user.findFirst.mockResolvedValue({ id: "user_1", role: "FREE" });

      const handler = (await import("../../pages/api/stripe/webhook")).default;
      const req = buildWebhookReq();
      const res = createResponse();

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
        select: { id: true, role: true },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { role: "PREMIUM", tokensRemaining: 99999 },
      });
    });

    it("downgrades PREMIUM users to FREE on customer.subscription.deleted", async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: {
            customer: "cus_123",
          },
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
  });
});
