import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import {
  getOrCreatePremiumFunnelContext,
  premiumFunnelProperties,
  premiumPricingHref,
  type PremiumFunnelContext,
} from "../lib/premiumFunnel";

const DISMISSED_KEY = "note2tabs:premium-home-callout-dismissed-at";
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

const hasPremiumAccess = (role?: string) =>
  role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";

export default function PremiumHomeCallout() {
  const { data: session, status } = useSession();
  const [funnel, setFunnel] = useState<PremiumFunnelContext | null>(null);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || hasPremiumAccess(session?.user?.role)) {
      shownRef.current = false;
      setVisible(false);
      return;
    }
    if (shownRef.current) return;
    let dismissedAt = 0;
    try {
      dismissedAt = Number(window.localStorage.getItem(DISMISSED_KEY) || 0);
    } catch {
      // The inline callout can still render when storage is unavailable.
    }
    if (Date.now() - dismissedAt < DISMISS_FOR_MS) return;

    const context = getOrCreatePremiumFunnelContext({
      source: "signed_home",
      reason: "signed_home_value",
    });
    shownRef.current = true;
    setFunnel(context);
    setVisible(true);
    sendEvent(ANALYTICS_EVENTS.premiumPromptShown, {
      surface: "signed_home_callout",
      ...premiumFunnelProperties(context),
    });
  }, [session?.user?.role, status]);

  if (!visible || !funnel) return null;

  return (
    <div className="premium-home-callout-wrap">
      <aside className="premium-home-callout" aria-label="Note2Tabs Premium">
        <div>
          <span>Note2Tabs Premium</span>
          <strong>More room for full songs and the Heavy model.</strong>
          <p>Get 100 monthly credits, rollover, and full-length audio-file transcription.</p>
        </div>
        <Link
          href={premiumPricingHref(funnel)}
          onClick={() => {
            sendEvent(ANALYTICS_EVENTS.premiumPromptClicked, {
              surface: "signed_home_callout",
              ...premiumFunnelProperties(funnel),
            });
            trackCtaClick("signed_home_explore_premium", {
              surface: "signed_home_callout",
              ...premiumFunnelProperties(funnel),
            });
          }}
        >
          Explore Premium
        </Link>
        <button
          type="button"
          aria-label="Dismiss Premium suggestion"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
            } catch {
              // Dismissal still works for the current page.
            }
            setVisible(false);
            sendEvent(ANALYTICS_EVENTS.premiumPromptDismissed, {
              surface: "signed_home_callout",
              ...premiumFunnelProperties(funnel),
            });
          }}
        >
          Dismiss
        </button>
      </aside>
    </div>
  );
}
