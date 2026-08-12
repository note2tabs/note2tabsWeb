import { useEffect, useState } from "react";
import { initPostHog } from "./posthogClient";
import {
  PREMIUM_OFFER_PRESENTATION_FLAG,
  normalizePremiumOfferVariant,
  type PremiumOfferVariant,
} from "./premiumOfferExperiment";

export function usePremiumOfferExperiment(enabled: boolean) {
  const [variant, setVariant] = useState<PremiumOfferVariant>("control");
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVariant("control");
      setResolved(true);
      return;
    }
    setResolved(false);

    let active = true;
    let unsubscribe: (() => void) | undefined;
    void initPostHog().then((posthog) => {
      if (!active) return;
      if (!posthog) {
        setResolved(true);
        return;
      }
      const applyVariant = () => {
        if (!active) return;
        setVariant(
          normalizePremiumOfferVariant(
            posthog.getFeatureFlag(PREMIUM_OFFER_PRESENTATION_FLAG)
          )
        );
        setResolved(true);
      };
      applyVariant();
      unsubscribe = posthog.onFeatureFlags(applyVariant);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [enabled]);

  return { variant, resolved };
}
