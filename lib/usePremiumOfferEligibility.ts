import { useEffect, useState } from "react";
import type { PremiumOfferVariant } from "./premiumOfferExperiment";
import { premiumTrialPresentationEnabled } from "./subscriptionPlans";

export type PremiumOfferEligibility = "unknown" | "eligible" | "ineligible";

export function usePremiumOfferEligibility(enabled: boolean): PremiumOfferEligibility {
  const [eligibility, setEligibility] = useState<PremiumOfferEligibility>("unknown");

  useEffect(() => {
    if (!enabled || !premiumTrialPresentationEnabled()) {
      setEligibility("unknown");
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/stripe/offer-eligibility", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { trialEligible?: boolean };
      })
      .then((payload) => {
        if (cancelled || typeof payload?.trialEligible !== "boolean") return;
        setEligibility(payload.trialEligible ? "eligible" : "ineligible");
      })
      .catch(() => {
        // Neutral offer copy remains accurate if Stripe cannot be reached.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled]);

  return eligibility;
}

export function premiumOfferCtaLabel(
  eligibility: PremiumOfferEligibility,
  fallback = "Get Premium",
  variant: PremiumOfferVariant = "control"
) {
  if (!premiumTrialPresentationEnabled()) return fallback;
  if (eligibility !== "eligible") return fallback;
  return variant === "value_framing"
    ? "Try Premium free for 7 days"
    : "Start 7-day trial";
}

export function premiumOfferReassurance(
  eligibility: PremiumOfferEligibility,
  variant: PremiumOfferVariant = "control",
  monthlyPrice = "$5.99"
) {
  if (!premiumTrialPresentationEnabled()) return `${monthlyPrice} billed today · Cancel anytime`;
  if (eligibility === "eligible") {
    return variant === "value_framing"
      ? `7 days free, then ${monthlyPrice}/month · Cancel anytime`
      : `${monthlyPrice}/month after trial · Cancel anytime`;
  }
  if (eligibility === "ineligible") return `${monthlyPrice}/month · Cancel anytime`;
  return "7-day trial for eligible new subscribers · Cancel anytime";
}
