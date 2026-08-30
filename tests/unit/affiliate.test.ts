import { describe, expect, it } from "vitest";
import { commissionAmount, normalizeAffiliateCode } from "../../lib/affiliate";

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
