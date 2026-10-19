import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const { prismaMock, stripeMock, payoutMock } = vi.hoisted(() => ({
  payoutMock: { prepare: vi.fn(), send: vi.fn(), rates: vi.fn() },
  prismaMock: {
    affiliate: { findUnique: vi.fn(), findMany: vi.fn() },
    affiliateCommission: { findMany: vi.fn(), update: vi.fn() },
  },
  stripeMock: {
    accounts: { retrieve: vi.fn() },
    transfers: { create: vi.fn() },
  },
}));

vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../lib/stripe", () => ({ stripeClient: stripeMock }));
vi.mock("../../lib/affiliatePayouts", () => ({ prepareAffiliatePayout: payoutMock.prepare, sendAffiliatePayout: payoutMock.send }));
vi.mock("../../lib/affiliatePayoutPolicy", () => ({ loadPayoutRates: payoutMock.rates }));

describe("affiliate flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.CRON_SECRET;
  });

  it("captures a valid referral in a short-lived, HttpOnly first-party cookie", async () => {
    prismaMock.affiliate.findUnique.mockResolvedValue({ id: "affiliate_1", code: "PLAYER10", status: "ACTIVE", cookieDays: 30 });
    const handler = (await import("../../pages/api/affiliate/capture")).default;
    const { req, res } = createMocks({ method: "POST", body: { code: "player10" } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const cookies = String(res.getHeader("Set-Cookie"));
    expect(cookies).toContain("n2t_ref=PLAYER10");
    expect(cookies).toContain("n2t_ref_click=");
    expect(cookies).toContain("Max-Age=2592000");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Lax");
  });

  it("keeps the referral discount functional when optional analytics is denied", async () => {
    prismaMock.affiliate.findUnique.mockResolvedValue({ id: "affiliate_1", code: "PLAYER10", status: "ACTIVE", cookieDays: 30 });
    const handler = (await import("../../pages/api/affiliate/capture")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { code: "PLAYER10" },
      cookies: { analytics_consent: "denied" },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(String(res.getHeader("Set-Cookie"))).toContain("n2t_ref=PLAYER10");
  });

  it("runs one monthly batch for each eligible affiliate", async () => {
    process.env.CRON_SECRET = "cron_test";
    prismaMock.affiliate.findMany.mockResolvedValue([{ id: "aff", stripeAccountId: "acct" }]);
    payoutMock.rates.mockResolvedValue({});
    payoutMock.prepare.mockResolvedValue({ id: "batch" });
    payoutMock.send.mockResolvedValue(true);
    const handler = (await import("../../pages/api/cron/pay-affiliate-commissions")).default;
    const { req, res } = createMocks({ method: "POST", headers: { authorization: "Bearer cron_test" } });
    await handler(req as any, res as any);
    expect(res._getJSONData()).toEqual({ ok: true, scanned: 1, paid: 1, failed: 0 });
    expect(payoutMock.send).toHaveBeenCalledWith("batch", "aff", "acct", stripeMock);
    expect(prismaMock.affiliate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ["ACTIVE", "DEACTIVATED"] } }) }));
  });
  it("does not release a below-threshold or already-paid balance", async () => {
    prismaMock.affiliate.findMany.mockResolvedValue([{ id: "aff", stripeAccountId: "acct" }]);
    payoutMock.rates.mockResolvedValue({});
    payoutMock.prepare.mockResolvedValue(null);
    const handler = (await import("../../pages/api/cron/pay-affiliate-commissions")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req as any, res as any);
    expect(res._getJSONData().paid).toBe(0);
    expect(payoutMock.send).not.toHaveBeenCalled();
  });
  it("holds all balances when exchange rates are unavailable", async () => {
    prismaMock.affiliate.findMany.mockResolvedValue([{ id: "aff", stripeAccountId: "acct" }]);
    payoutMock.rates.mockRejectedValue(new Error("offline"));
    const handler = (await import("../../pages/api/cron/pay-affiliate-commissions")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(503);
    expect(payoutMock.prepare).not.toHaveBeenCalled();
  });
  it("does not process commissions for an unauthorized request", async () => {
    process.env.CRON_SECRET = "cron_test";
    const handler = (await import("../../pages/api/cron/pay-affiliate-commissions")).default;
    const { req, res } = createMocks({ method: "POST" });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
    expect(prismaMock.affiliate.findMany).not.toHaveBeenCalled();
  });
});
