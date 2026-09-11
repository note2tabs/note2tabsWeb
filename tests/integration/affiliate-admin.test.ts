import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const { sessionMock, roleMock, prismaMock, stripeMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  roleMock: vi.fn(),
  prismaMock: { user: { findUnique: vi.fn() }, affiliate: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
  stripeMock: { accounts: { create: vi.fn() }, prices: { retrieve: vi.fn() }, coupons: { create: vi.fn() }, promotionCodes: { create: vi.fn(), update: vi.fn() } },
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
      percent_off: 15, duration_in_months: 4, applies_to: { products: ["prod_premium", "prod_pro"] },
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
});
