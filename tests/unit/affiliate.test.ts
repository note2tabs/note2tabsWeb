import { describe, expect, it } from "vitest";
import { affiliateCanEarnCommission, commissionAmount, normalizeAffiliateCode } from "../../lib/affiliate";

describe("affiliate terms", () => {
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
