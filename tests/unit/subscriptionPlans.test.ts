import { describe, expect, it } from "vitest";
import { PLAN_CATALOG, effectiveSubscriptionPlan, normalizeSubscriptionPlan } from "../../lib/subscriptionPlans";

describe("subscription plan catalogue", () => {
  it("defines the approved Pro economics and limits", () => {
    expect(PLAN_CATALOG.PRO).toMatchObject({
      monthlyPriceUsd: 14.99,
      monthlyCredits: 250,
      rolloverCap: 500,
      trialDays: 0,
      maxUploadBytes: 500 * 1024 * 1024,
      youtubePositionLimitSeconds: 1200,
      prioritySupport: true,
      earlyAccessEligible: true,
    });
  });

  it("keeps legacy paid roles on Premium and rejects unknown plans", () => {
    expect(effectiveSubscriptionPlan("PREMIUM", undefined)).toBe("PREMIUM");
    expect(normalizeSubscriptionPlan("enterprise")).toBe("FREE");
  });
});
