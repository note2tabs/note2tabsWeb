import { createContext, useContext, useEffect, useState } from "react";
import type { CreditUpgradeQuote } from "../components/CreditUpgradeReview";

// Only provided by the development-only review route. Server billing authorization is unchanged.
export const CreditUpgradePreviewContext = createContext<{ quote: CreditUpgradeQuote; preview: true } | null>(null);
export function useCreditUpgradeQuote(enabled: boolean, balanceKey?: number) {
  const fixture = useContext(CreditUpgradePreviewContext);
  const [quote, setQuote] = useState<CreditUpgradeQuote | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled || fixture) { setQuote(null); return; }
    const controller = new AbortController();
    setQuote(null);
    void fetch("/api/stripe/change-plan", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ plan: "pro", billingInterval: "monthly", action: "quote" }),
    }).then(async response => {
      const result = await response.json();
      if (!controller.signal.aborted) setQuote(response.ok ? result.quote || null : null);
    }).catch(() => { /* A missing quote retains the existing review-on-pricing route. */ });
    return () => controller.abort();
  }, [enabled, balanceKey, revision, fixture]);
  return { quote: enabled ? fixture?.quote || quote : null, preview: Boolean(fixture), refresh: () => setRevision(value => value + 1) };
}
