import { useEffect, useState } from "react";

export function useHeavyPreviewCountryEligibility(enabled: boolean) {
  const [countryEligible, setCountryEligible] = useState(false);
  const [resolved, setResolved] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setCountryEligible(false);
      setResolved(true);
      return;
    }
    let cancelled = false;
    setResolved(false);
    fetch("/api/heavy-preview/eligibility", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled) setCountryEligible(payload?.countryEligible === true);
      })
      .catch(() => {
        if (!cancelled) setCountryEligible(false);
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { countryEligible, resolved };
}
