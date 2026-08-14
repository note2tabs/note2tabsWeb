import { describe, expect, it } from "vitest";
import {
  normalizePremiumOfferVariant,
  premiumOfferExperimentProperties,
} from "../../lib/premiumOfferExperiment";
import {
  premiumOfferCtaLabel,
  premiumOfferReassurance,
} from "../../lib/usePremiumOfferEligibility";

describe("Premium offer presentation experiment", () => {
  it("fails closed to the established control presentation", () => {
    expect(normalizePremiumOfferVariant(undefined)).toBe("control");
    expect(normalizePremiumOfferVariant("unexpected")).toBe("control");
    expect(premiumOfferCtaLabel("eligible")).toBe("Start 7-day trial");
  });

  it("changes presentation without changing price or trial length", () => {
    expect(normalizePremiumOfferVariant("value_framing")).toBe("value_framing");
    expect(premiumOfferCtaLabel("eligible", "Get Premium", "value_framing")).toBe(
      "Try Premium free for 7 days"
    );
    expect(premiumOfferReassurance("eligible", "value_framing")).toBe(
      "7 days free, then $5.99/month · Cancel anytime"
    );
  });

  it("attaches the variant to both custom and PostHog experiment properties", () => {
    expect(premiumOfferExperimentProperties("value_framing")).toEqual({
      offer_variant: "value_framing",
      "$feature/premium-trial-presentation": "value_framing",
    });
  });
});
