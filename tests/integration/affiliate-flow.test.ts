import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const { prismaMock, stripeMock } = vi.hoisted(() => ({
  prismaMock: {
    affiliate: { findUnique: vi.fn() },
    affiliateCommission: { findMany: vi.fn(), update: vi.fn() },
  },
  stripeMock: {
    accounts: { retrieve: vi.fn() },
    transfers: { create: vi.fn() },
  },
}));

vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../lib/stripe", () => ({ stripeClient: stripeMock }));

describe("affiliate flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("pays an eligible commission through Stripe Connect exactly once", async () => {
    process.env.CRON_SECRET = "cron_test";
    const commission = {
      id: "commission_1",
      affiliateId: "affiliate_1",
      stripeInvoiceId: "in_1",
      stripeChargeId: "ch_1",
      commissionAmount: 120,
      currency: "usd",
      affiliate: { stripeAccountId: "acct_1" },
    };
    prismaMock.affiliateCommission.findMany.mockResolvedValue([commission]);
    prismaMock.affiliateCommission.update.mockResolvedValue({});
    stripeMock.accounts.retrieve.mockResolvedValue({
      id: "acct_1",
      payouts_enabled: true,
      details_submitted: true,
    });
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_1" });
    const handler = (await import("../../pages/api/cron/pay-affiliate-commissions")).default;
    const { req, res } = createMocks({
      method: "POST",
      headers: { authorization: "Bearer cron_test" },
    });

    await handler(req as any, res as any);

    expect(res._getJSONData()).toEqual({
      ok: true,
      scanned: 1,
      paid: 1,
      waitingForOnboarding: 0,
      failed: 0,
    });
    expect(stripeMock.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 120,
        currency: "usd",
        destination: "acct_1",
        source_transaction: "ch_1",
      }),
      { idempotencyKey: "affiliate-commission-commission_1" }
    );
    expect(prismaMock.affiliateCommission.update).toHaveBeenCalledWith({
      where: { id: "commission_1" },
      data: expect.objectContaining({ status: "PAID", stripeTransferId: "tr_1" }),
    });
    expect(prismaMock.affiliateCommission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          affiliate: expect.objectContaining({ status: { in: ["ACTIVE", "DEACTIVATED"] } }),
        }),
      })
    );
  });

  it("holds commissions until Stripe onboarding is complete", async () => {
    process.env.CRON_SECRET = "cron_test";
    prismaMock.affiliateCommission.findMany.mockResolvedValue([{
      id: "commission_1",
      affiliateId: "affiliate_1",
      stripeInvoiceId: "in_1",
      stripeChargeId: "ch_1",
      commissionAmount: 120,
      currency: "usd",
      affiliate: { stripeAccountId: "acct_1" },
    }]);
    stripeMock.accounts.retrieve.mockResolvedValue({
      id: "acct_1",
      payouts_enabled: false,
      details_submitted: false,
    });
    const handler = (await import("../../pages/api/cron/pay-affiliate-commissions")).default;
    const { req, res } = createMocks({
      method: "POST",
      headers: { authorization: "Bearer cron_test" },
    });

    await handler(req as any, res as any);

    expect(res._getJSONData()).toEqual(expect.objectContaining({
      paid: 0,
      waitingForOnboarding: 1,
      failed: 0,
    }));
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();
  });
});
