import { beforeEach, describe, it, expect, vi } from "vitest";
import { createMocks } from "node-mocks-http";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  create: vi.fn(),
  user: vi.fn(),
  order: vi.fn(),
  update: vi.fn(),
  status: vi.fn(),
}));
vi.mock("next-auth/next", () => ({ getServerSession: m.auth }));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("../../lib/urls", () => ({
  getAppBaseUrl: () => "https://note2tabs.com",
}));
vi.mock("../../lib/stripe", () => ({
  stripeClient: { checkout: { sessions: { create: m.create } } },
}));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: m.user },
    creditTopUpOrder: {
      create: m.order,
      update: m.update,
      findFirst: m.status,
    },
  },
}));
import handler from "../../pages/api/stripe/credit-top-up";
import statusHandler from "../../pages/api/stripe/credit-top-up-status";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CREDIT_TOPUPS_ENABLED", "true");
  vi.stubEnv("STRIPE_CREDIT_TOPUP_PRODUCT_ID", "prod_test");
  m.auth.mockResolvedValue({ user: { id: "free-user" } });
  m.user.mockResolvedValue({ id: "free-user", email: "test@example.test" });
  m.order.mockResolvedValue({ id: "order_test" });
  m.create.mockResolvedValue({
    id: "cs_test",
    url: "https://checkout.stripe.com/test",
  });
});
const request = (
  body: any = { credits: 15, locale: "fr" },
  origin = "https://note2tabs.com",
) => createMocks({ method: "POST", headers: { origin }, body });
describe("credit purchase checkout", () => {
  it("quotes Free-account purchases on the server without creating a subscription or customer", async () => {
    const { req, res } = request({ credits: 30, locale: "fr", amountCents: 1 });
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    const [params, options] = m.create.mock.calls[0];
    expect(params).toMatchObject({
      mode: "payment",
      client_reference_id: "free-user",
      locale: "fr",
      adaptive_pricing: { enabled: false },
      line_items: [
        {
          quantity: 1,
          price_data: {
            unit_amount: 249,
            currency: "usd",
            product: "prod_test",
          },
        },
      ],
    });
    expect(params.customer).toBeUndefined();
    expect(params.subscription_data).toBeUndefined();
    expect(params.cancel_url).toBe(
      "https://note2tabs.com/fr/credits?payment=cancelled",
    );
    expect(options.idempotencyKey).toBe("credit-top-up:order_test");
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "order_test" },
      data: { checkoutSessionId: "cs_test" },
    });
  });
  it.each([0, 14, 16, "15", -15])(
    "rejects invalid credits %s",
    async (credits) => {
      const { req, res } = request({ credits });
      await handler(req as any, res as any);
      expect(res.statusCode).toBe(400);
      expect(m.create).not.toHaveBeenCalled();
    },
  );
  it.each(["https://evil.test", "broken", ""])(
    "rejects other or missing origins",
    async (origin) => {
      const { req, res } = request(undefined, origin);
      await handler(req as any, res as any);
      expect(res.statusCode).toBe(403);
      expect(m.create).not.toHaveBeenCalled();
    },
  );
  it("requires authentication", async () => {
    m.auth.mockResolvedValue(null);
    const { req, res } = request();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });
  it("stays unavailable until explicitly enabled", async () => {
    vi.stubEnv("CREDIT_TOPUPS_ENABLED", "false");
    const { req, res } = request();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(404);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("does not report success when Stripe fails", async () => {
    m.create.mockRejectedValue(Error("network"));
    const { req, res } = request();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(503);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("limits payment-status reads to the authenticated owner", async () => {
    m.status.mockResolvedValue(null);
    const { req, res } = createMocks({
      method: "GET",
      query: { session_id: "cs_someone_else" },
    });
    await statusHandler(req as any, res as any);
    expect(res.statusCode).toBe(404);
    expect(m.status.mock.calls[0][0].where).toEqual({
      checkoutSessionId: "cs_someone_else",
      userId: "free-user",
    });
  });
});
