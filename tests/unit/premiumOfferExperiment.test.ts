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
    expect(premiumOfferCtaLabel("eligible")).toBe("Get Premium");
  });

  it("retains immediate billing copy for legacy experiment variants", () => {
    expect(normalizePremiumOfferVariant("value_framing")).toBe("value_framing");
    expect(premiumOfferCtaLabel("eligible", "Get Premium", "value_framing")).toBe(
      "Get Premium"
    );
    expect(premiumOfferReassurance("eligible", "value_framing")).toBe(
      "$5.99/month billed today · Cancel anytime"
    );
  });

  it("attaches the variant to both custom and PostHog experiment properties", () => {
    expect(premiumOfferExperimentProperties("value_framing")).toEqual({
      offer_variant: "value_framing",
      "$feature/premium-trial-presentation": "value_framing",
    });
  });
});

// Even a stale eligibility response must never advertise an unavailable offer.
describe("current paid offer", () => {
  it.each(["unknown", "eligible", "ineligible"] as const)("shows immediate billing for %s", (state) => {
    expect(premiumOfferCtaLabel(state)).toBe("Get Premium");
    expect(premiumOfferReassurance(state)).toBe("$5.99/month billed today · Cancel anytime");
  });
});
