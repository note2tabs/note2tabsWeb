import { useEffect, useState } from "react";
import type { PremiumOfferVariant } from "./premiumOfferExperiment";

export type PremiumOfferEligibility = "unknown" | "eligible" | "ineligible";

export function usePremiumOfferEligibility(enabled: boolean): PremiumOfferEligibility {
  const [eligibility, setEligibility] = useState<PremiumOfferEligibility>("unknown");

  useEffect(() => {
    if (!enabled) {
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
  if (eligibility !== "eligible") return fallback;
  return variant === "value_framing"
    ? "Try Premium free for 7 days"
    : "Start 7-day trial";
}

export function premiumOfferReassurance(
  eligibility: PremiumOfferEligibility,
  variant: PremiumOfferVariant = "control"
) {
  if (eligibility === "eligible") {
    return variant === "value_framing"
      ? "7 days free, then $5.99/month · Cancel anytime"
      : "$5.99/month after trial · Cancel anytime";
  }
  if (eligibility === "ineligible") return "$5.99/month · Cancel anytime";
  return "7-day trial for eligible new subscribers · Cancel anytime";
}
