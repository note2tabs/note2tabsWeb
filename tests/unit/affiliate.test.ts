import { describe, expect, it } from "vitest";
import { affiliateCanEarnCommission, commissionAmount, normalizeAffiliateCode, parseAffiliateTerms } from "../../lib/affiliate";

describe("affiliate terms", () => {
  it("accepts per-affiliate commission and discount terms", () => {
    expect(parseAffiliateTerms({ commissionPercent: 35, commissionMonths: 9, discountPercent: 15, discountMonths: 4 }))
      .toEqual({ commissionPercent: 35, commissionMonths: 9, discountPercent: 15, discountMonths: 4 });
  });

  it.each([
    { commissionPercent: 0, commissionMonths: 6, discountPercent: 10, discountMonths: 3 },
    { commissionPercent: 20.5, commissionMonths: 6, discountPercent: 10, discountMonths: 3 },
    { commissionPercent: 20, commissionMonths: 25, discountPercent: 10, discountMonths: 3 },
    { commissionPercent: 20, commissionMonths: 6, discountPercent: 101, discountMonths: 3 },
    { commissionPercent: 20, commissionMonths: 6, discountPercent: 10, discountMonths: 0 },
  ])("rejects invalid affiliate terms", (terms) => {
    expect(parseAffiliateTerms(terms)).toBeNull();
  });

  it("normalizes safe customer-facing codes", () => {
    expect(normalizeAffiliateCode(" creator_20 ")).toBe("CREATOR_20");
    expect(normalizeAffiliateCode("x")).toBeNull();
    expect(normalizeAffiliateCode("bad code")).toBeNull();
  });

  it("calculates commission in integer minor currency units", () => {
    expect(commissionAmount(539, 20)).toBe(108);
    expect(commissionAmount(0, 20)).toBe(0);
    expect(commissionAmount(539, 200)).toBe(539);
  });
});

describe("affiliate deactivation cutoff", () => {
  const cutoff = new Date("2026-08-30T12:00:00Z");

  it("keeps recurring commissions for customers referred before deactivation", () => {
    expect(affiliateCanEarnCommission({
      status: "DEACTIVATED", deactivatedAt: cutoff,
      referralCreatedAt: new Date("2026-08-30T11:59:59Z"),
    })).toBe(true);
  });

  it("rejects commissions for referrals created after deactivation", () => {
    expect(affiliateCanEarnCommission({
      status: "DEACTIVATED", deactivatedAt: cutoff,
      referralCreatedAt: new Date("2026-08-30T12:00:01Z"),
    })).toBe(false);
  });
});
