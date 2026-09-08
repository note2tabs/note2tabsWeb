import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";
import { parseStandalonePromotionInput } from "../../lib/standalonePromotion";

const { sessionMock, roleMock, stripeMock, configMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  roleMock: vi.fn(),
  configMock: vi.fn(),
  stripeMock: {
    promotionCodes: { list: vi.fn(), create: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
    coupons: { create: vi.fn(), del: vi.fn() },
    prices: { retrieve: vi.fn() },
  },
}));

vi.mock("next-auth/next", () => ({ getServerSession: sessionMock }));
vi.mock("../../lib/serverAuth", () => ({ hasFreshUserRole: roleMock }));
vi.mock("../../lib/stripe", () => ({ stripeClient: stripeMock }));
vi.mock("../../lib/stripePremium", () => ({ getStripePaidPlanConfigs: configMock }));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

describe("standalone promotion input", () => {
  it("normalizes a valid code and parses a future end date", () => {
    const input = parseStandalonePromotionInput({ code: " summer-20 ", percentOff: 20, durationMonths: 3, expiresOn: "2099-12-31" });
    expect(input).toMatchObject({ code: "SUMMER-20", percentOff: 20, durationMonths: 3 });
    expect(input?.expiresAt).toBe(Math.floor(Date.UTC(2099, 11, 31, 23, 59, 59) / 1000));
  });

  it.each([
    { code: "NO", percentOff: 10, durationMonths: 3 },
    { code: "INVALID_CODE", percentOff: 10, durationMonths: 3 },
    { code: "VALID", percentOff: 0, durationMonths: 3 },
    { code: "VALID", percentOff: 10, durationMonths: 25 },
    { code: "VALID", percentOff: 10, durationMonths: 3, expiresOn: "2020-01-01" },
  ])("rejects invalid values", (body) => expect(parseStandalonePromotionInput(body)).toBeNull());
});

describe("standalone promotion API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.mockResolvedValue({ user: { id: "admin_1" } });
    roleMock.mockResolvedValue(true);
    configMock.mockReturnValue({ PREMIUM: { priceId: "price_premium", productId: "prod_premium" }, PRO: { priceId: "price_pro", productId: "prod_pro" } });
    stripeMock.promotionCodes.list.mockResolvedValue({ data: [] });
    stripeMock.coupons.create.mockResolvedValue({ id: "coupon_1" });
    stripeMock.coupons.del.mockResolvedValue({ id: "coupon_1", deleted: true });
    stripeMock.promotionCodes.create.mockResolvedValue({ id: "promo_1", code: "SUMMER20", active: true, expires_at: 4090895999 });
  });

  it("creates a non-affiliate discount for all configured paid products", async () => {
    const handler = (await import("../../pages/api/admin/affiliates/promotions/create")).default;
    const { req, res } = createMocks({ method: "POST", body: { code: "summer20", percentOff: 20, durationMonths: 4, expiresOn: "2099-08-20" } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(201);
    expect(stripeMock.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ percent_off: 20, duration_in_months: 4, applies_to: { products: ["prod_premium", "prod_pro"] }, metadata: expect.objectContaining({ note2tabsStandalonePromotion: "true" }) }));
    expect(stripeMock.promotionCodes.create).toHaveBeenCalledWith(expect.objectContaining({ code: "SUMMER20", active: true, expires_at: expect.any(Number) }));
  });

  it("rejects duplicate active codes", async () => {
    stripeMock.promotionCodes.list.mockResolvedValue({ data: [{ id: "promo_existing" }] });
    const handler = (await import("../../pages/api/admin/affiliates/promotions/create")).default;
    const { req, res } = createMocks({ method: "POST", body: { code: "SUMMER20", percentOff: 20, durationMonths: 4 } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(409);
    expect(stripeMock.coupons.create).not.toHaveBeenCalled();
  });

  it("removes the coupon if promotion-code creation fails", async () => {
    stripeMock.promotionCodes.create.mockRejectedValue(new Error("Stripe error"));
    const handler = (await import("../../pages/api/admin/affiliates/promotions/create")).default;
    const { req, res } = createMocks({ method: "POST", body: { code: "SUMMER20", percentOff: 20, durationMonths: 4 } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(500);
    expect(stripeMock.coupons.del).toHaveBeenCalledWith("coupon_1");
  });

  it("rejects non-admin users", async () => {
    roleMock.mockResolvedValue(false);
    const handler = (await import("../../pages/api/admin/affiliates/promotions/create")).default;
    const { req, res } = createMocks({ method: "POST", body: { code: "SUMMER20", percentOff: 20, durationMonths: 4 } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
    expect(stripeMock.promotionCodes.list).not.toHaveBeenCalled();
  });

  it("only deactivates standalone codes", async () => {
    stripeMock.promotionCodes.retrieve.mockResolvedValue({ id: "promo_1", active: true, metadata: { note2tabsStandalonePromotion: "true" } });
    const handler = (await import("../../pages/api/admin/affiliates/promotions/deactivate")).default;
    const { req, res } = createMocks({ method: "POST", body: { promotionId: "promo_1" } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    expect(stripeMock.promotionCodes.update).toHaveBeenCalledWith("promo_1", { active: false });
  });
});
