import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const { sessionMock, roleMock, prismaMock, stripeMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  roleMock: vi.fn(),
  prismaMock: { user: { findUnique: vi.fn() }, affiliate: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
  stripeMock: { accounts: { create: vi.fn() }, prices: { retrieve: vi.fn() }, coupons: { create: vi.fn(), retrieve: vi.fn(), del: vi.fn() }, promotionCodes: { create: vi.fn(), update: vi.fn() } },
}));

vi.mock("next-auth/next", () => ({ getServerSession: sessionMock }));
vi.mock("../../lib/serverAuth", () => ({ hasFreshUserRole: roleMock }));
vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../lib/stripe", () => ({ stripeClient: stripeMock }));
vi.mock("../../lib/stripePremium", () => ({
  getStripePremiumConfig: () => ({ priceId: "price_premium", productId: "prod_premium" }),
  getStripePaidPlanConfigs: () => ({
    PREMIUM: { plan: "PREMIUM", priceId: "price_premium", productId: "prod_premium" },
    PRO: { plan: "PRO", priceId: "price_pro", productId: "prod_pro" },
  }),
}));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

describe("affiliate administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.mockResolvedValue({ user: { id: "admin_1" } });
    roleMock.mockResolvedValue(true);
    stripeMock.promotionCodes.update.mockResolvedValue({ id: "promo_1", active: false });
    stripeMock.coupons.del.mockResolvedValue({ id: "coupon_1", deleted: true });
    prismaMock.affiliate.update.mockResolvedValue({ id: "aff_1", code: "PLAYER10", status: "DEACTIVATED" });
  });

  it("disables the Stripe promotion before deactivating future referrals", async () => {
    prismaMock.affiliate.findUnique.mockResolvedValue({
      id: "aff_1", code: "PLAYER10", status: "ACTIVE", stripePromotionCodeId: "promo_1",
    });
    const handler = (await import("../../pages/api/admin/affiliates/deactivate")).default;
    const { req, res } = createMocks({ method: "POST", body: { affiliateId: "aff_1" } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(stripeMock.promotionCodes.update).toHaveBeenCalledWith("promo_1", { active: false });
    expect(prismaMock.affiliate.update).toHaveBeenCalledWith({
      where: { id: "aff_1" }, data: { status: "DEACTIVATED" },
      select: { id: true, code: true, status: true },
    });
    expect(stripeMock.promotionCodes.update.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.affiliate.update.mock.invocationCallOrder[0]
    );
  });

  it("is idempotent for an already deactivated affiliate", async () => {
    prismaMock.affiliate.findUnique.mockResolvedValue({
      id: "aff_1", code: "PLAYER10", status: "DEACTIVATED", stripePromotionCodeId: "promo_1",
    });
    const handler = (await import("../../pages/api/admin/affiliates/deactivate")).default;
    const { req, res } = createMocks({ method: "POST", body: { affiliateId: "aff_1" } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(stripeMock.promotionCodes.update).not.toHaveBeenCalled();
    expect(prismaMock.affiliate.update).not.toHaveBeenCalled();
  });

  it("rejects non-admin users without touching Stripe", async () => {
    roleMock.mockResolvedValue(false);
    const handler = (await import("../../pages/api/admin/affiliates/deactivate")).default;
    const { req, res } = createMocks({ method: "POST", body: { affiliateId: "aff_1" } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    expect(stripeMock.promotionCodes.update).not.toHaveBeenCalled();
  });

  it("creates Stripe and database records with custom terms", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user_1", email: "artist@example.com" });
    prismaMock.affiliate.create.mockResolvedValue({
      id: "aff_1", code: "ARTIST15", commissionPercent: 35, commissionMonths: 9,
      discountPercent: 15, discountMonths: 4,
    });
    prismaMock.affiliate.update.mockResolvedValue({
      id: "aff_1", code: "ARTIST15", status: "ACTIVE", commissionPercent: 35,
      commissionMonths: 9, discountPercent: 15, discountMonths: 4,
    });
    stripeMock.accounts.create.mockResolvedValue({ id: "acct_1" });
    stripeMock.prices.retrieve.mockResolvedValue({ product: "prod_premium" });
    stripeMock.coupons.create.mockResolvedValue({ id: "coupon_1" });
    stripeMock.promotionCodes.create.mockResolvedValue({ id: "promo_1" });
    const handler = (await import("../../pages/api/admin/affiliates/invite")).default;
    const { req, res } = createMocks({ method: "POST", body: {
      email: "artist@example.com", code: "artist15", commissionPercent: 35,
      commissionMonths: 9, discountPercent: 15, discountMonths: 4,
    } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(prismaMock.affiliate.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "user_1", code: "ARTIST15", commissionPercent: 35, commissionMonths: 9,
      discountPercent: 15, discountMonths: 4,
    }) });
    expect(stripeMock.coupons.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "N2T ARTIST15", percent_off: 15, duration_in_months: 4,
      applies_to: { products: ["prod_premium", "prod_pro"] },
    }));
  });

  it("rejects invalid custom terms before creating an affiliate", async () => {
    const handler = (await import("../../pages/api/admin/affiliates/invite")).default;
    const { req, res } = createMocks({ method: "POST", body: {
      email: "artist@example.com", code: "ARTIST15", commissionPercent: 101,
      commissionMonths: 9, discountPercent: 15, discountMonths: 4,
    } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.affiliate.create).not.toHaveBeenCalled();
  });

  it("replaces a legacy Premium-only coupon with one valid for Premium and Pro", async () => {
    prismaMock.affiliate.findUnique.mockResolvedValue({
      id: "aff_1", code: "PLAYER10", status: "ACTIVE", stripeCouponId: "coupon_old",
      stripePromotionCodeId: "promo_old", discountPercent: 10, discountMonths: 3,
    });
    prismaMock.affiliate.update.mockResolvedValue({ id: "aff_1" });
    stripeMock.coupons.retrieve.mockResolvedValue({
      id: "coupon_old", valid: true, applies_to: { products: ["prod_premium"] },
    });
    stripeMock.coupons.create.mockResolvedValue({ id: "coupon_new" });
    stripeMock.promotionCodes.create.mockResolvedValue({ id: "promo_new" });
    const handler = (await import("../../pages/api/admin/affiliates/repair-coupons")).default;
    const { req, res } = createMocks({ method: "POST", body: { affiliateId: "aff_1" } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchObject({ repaired: true, affiliateId: "aff_1" });
    expect(stripeMock.coupons.create).toHaveBeenCalledWith(expect.objectContaining({
      applies_to: { products: ["prod_premium", "prod_pro"] },
      percent_off: 10, duration_in_months: 3,
    }));
    expect(stripeMock.promotionCodes.update).toHaveBeenCalledWith("promo_old", { active: false });
    expect(stripeMock.promotionCodes.create).toHaveBeenCalledWith(expect.objectContaining({
      coupon: "coupon_new", code: "PLAYER10", active: true,
    }));
    expect(prismaMock.affiliate.update).toHaveBeenCalledWith({
      where: { id: "aff_1" },
      data: { stripeCouponId: "coupon_new", stripePromotionCodeId: "promo_new" },
    });
  });

  it("does not replace a coupon that already supports every paid plan", async () => {
    prismaMock.affiliate.findUnique.mockResolvedValue({
      id: "aff_1", code: "PLAYER10", status: "ACTIVE", stripeCouponId: "coupon_current",
      stripePromotionCodeId: "promo_current", discountPercent: 10, discountMonths: 3,
    });
    stripeMock.coupons.retrieve.mockResolvedValue({
      id: "coupon_current", valid: true,
      applies_to: { products: ["prod_premium", "prod_pro"] },
    });
    const handler = (await import("../../pages/api/admin/affiliates/repair-coupons")).default;
    const { req, res } = createMocks({ method: "POST", body: { affiliateId: "aff_1" } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchObject({ repaired: false });
    expect(stripeMock.coupons.create).not.toHaveBeenCalled();
    expect(prismaMock.affiliate.update).not.toHaveBeenCalled();
  });

  it("restores the legacy promotion if replacement creation fails", async () => {
    prismaMock.affiliate.findUnique.mockResolvedValue({
      id: "aff_1", code: "PLAYER10", status: "ACTIVE", stripeCouponId: "coupon_old",
      stripePromotionCodeId: "promo_old", discountPercent: 10, discountMonths: 3,
    });
    stripeMock.coupons.retrieve.mockResolvedValue({
      id: "coupon_old", valid: true, applies_to: { products: ["prod_premium"] },
    });
    stripeMock.coupons.create.mockResolvedValue({ id: "coupon_new" });
    stripeMock.promotionCodes.create.mockRejectedValue(new Error("Stripe unavailable"));
    const handler = (await import("../../pages/api/admin/affiliates/repair-coupons")).default;
    const { req, res } = createMocks({ method: "POST", body: { affiliateId: "aff_1" } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(stripeMock.promotionCodes.update).toHaveBeenNthCalledWith(1, "promo_old", { active: false });
    expect(stripeMock.promotionCodes.update).toHaveBeenNthCalledWith(2, "promo_old", { active: true });
    expect(stripeMock.coupons.del).toHaveBeenCalledWith("coupon_new");
    expect(prismaMock.affiliate.update).not.toHaveBeenCalled();
  });
});
