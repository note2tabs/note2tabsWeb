import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const { sessionMock, roleMock, prismaMock, stripeMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  roleMock: vi.fn(),
  prismaMock: { affiliate: { findUnique: vi.fn(), update: vi.fn() } },
  stripeMock: { promotionCodes: { update: vi.fn() } },
}));

vi.mock("next-auth/next", () => ({ getServerSession: sessionMock }));
vi.mock("../../lib/serverAuth", () => ({ hasFreshUserRole: roleMock }));
vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../lib/stripe", () => ({ stripeClient: stripeMock }));
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
});
