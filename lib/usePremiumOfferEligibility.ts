import type { PremiumOfferVariant } from "./premiumOfferExperiment";
export type PremiumOfferEligibility = "unknown" | "eligible" | "ineligible";
// Current subscriptions are charged immediately; do not fetch historical trial eligibility.
export function usePremiumOfferEligibility(_enabled: boolean): PremiumOfferEligibility {
  return "ineligible";
}
export function premiumOfferCtaLabel(
  _eligibility: PremiumOfferEligibility,
  fallback = "Get Premium",
  _variant: PremiumOfferVariant = "control"
) { return fallback; }
export function premiumOfferReassurance(
  _eligibility: PremiumOfferEligibility,
  _variant: PremiumOfferVariant = "control"
) { return "$5.99/month billed today · Cancel anytime"; }
