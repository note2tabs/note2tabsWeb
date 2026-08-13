export const PREMIUM_OFFER_PRESENTATION_FLAG = "premium-trial-presentation";

export const PREMIUM_OFFER_VARIANTS = ["control", "value_framing"] as const;

export type PremiumOfferVariant = (typeof PREMIUM_OFFER_VARIANTS)[number];

export function normalizePremiumOfferVariant(value: unknown): PremiumOfferVariant {
  return value === "value_framing" ? "value_framing" : "control";
}

export function premiumOfferExperimentProperties(variant: PremiumOfferVariant) {
  return {
    offer_variant: variant,
    [`$feature/${PREMIUM_OFFER_PRESENTATION_FLAG}`]: variant,
  };
}
