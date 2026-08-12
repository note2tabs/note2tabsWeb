import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  getPostHogIdentifiedUserId,
  identifyPostHogUser,
  isPostHogIdentityResetPending,
  resetPostHogIdentity,
} from "../lib/posthogClient";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";
import { takeOAuthIntent } from "../lib/oauthAnalytics";
import { categorizeAnalyticsDestination } from "../lib/analyticsPrivacy";
import { getAcquisitionProperties } from "../lib/acquisitionAttribution";
import { getAnalyticsTrackingIds } from "../lib/analyticsV2";
import { premiumFunnelProperties, readPremiumFunnelContext } from "../lib/premiumFunnel";

export default function AnalyticsIdentityLinker() {
  const { data: session, status } = useSession();
  const [consentRevision, setConsentRevision] = useState(0);
  const linkedIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    const handleConsentChange = () => setConsentRevision((value) => value + 1);
    window.addEventListener("note2tabs:analytics-consent-changed", handleConsentChange);
    return () => window.removeEventListener("note2tabs:analytics-consent-changed", handleConsentChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const postHogConfigured = Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);

    const syncIdentity = async () => {
      if (status === "unauthenticated") {
        linkedIdentityRef.current = null;
        if (postHogConfigured && getPostHogIdentifiedUserId()) {
          await resetPostHogIdentity();
        }
        return;
      }
      if (status !== "authenticated" || !session?.user?.id) return;

      if (postHogConfigured) {
        const previouslyIdentifiedUserId = getPostHogIdentifiedUserId();
        if (
          isPostHogIdentityResetPending() ||
          (previouslyIdentifiedUserId && previouslyIdentifiedUserId !== session.user.id)
        ) {
          await resetPostHogIdentity();
        }
        if (cancelled) return;

        identifyPostHogUser(session.user.id, {
          role: session.user.role,
          subscription: session.user.role === "PREMIUM" ? "premium" : "free",
          ...getAcquisitionProperties(),
        });
      }
      const oauthIntent = takeOAuthIntent();
      const trackingIds = getAnalyticsTrackingIds();
      const funnel = readPremiumFunnelContext();
      const identityLinkKey = `${session.user.id}:${trackingIds?.anonId || "no-anon"}`;
      if (linkedIdentityRef.current !== identityLinkKey) {
        linkedIdentityRef.current = identityLinkKey;
        try {
          await fetch("/api/analytics/link-identity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: oauthIntent?.intent === "signup" ? "signup" : "login",
              anonId: trackingIds?.anonId,
              sessionId: trackingIds?.sessionId,
              funnelId: funnel?.funnelId,
              funnelSource: funnel?.source,
              funnelReason: funnel?.reason,
            }),
            keepalive: true,
          });
        } catch {
          // Identity measurement must never interrupt authentication.
        }
      }
      if (cancelled) return;
      const createdAtMs = session.user.createdAt ? Date.parse(session.user.createdAt) : Number.NaN;
      const isRecentlyCreated =
        Number.isFinite(createdAtMs) && Date.now() - createdAtMs >= 0 && Date.now() - createdAtMs < 10 * 60 * 1000;
      if (oauthIntent && isRecentlyCreated) {
        sendEvent(ANALYTICS_EVENTS.signupCompleted, {
          method: "google",
          destination: categorizeAnalyticsDestination(oauthIntent.next),
          initiatedAs: oauthIntent.intent,
          ...(funnel ? premiumFunnelProperties(funnel) : {}),
        });
      } else if (oauthIntent) {
        sendEvent(ANALYTICS_EVENTS.loginSucceeded, {
          method: "google",
          destination: categorizeAnalyticsDestination(oauthIntent.next),
          initiatedAs: oauthIntent.intent,
          ...(funnel ? premiumFunnelProperties(funnel) : {}),
        });
      }
    };

    void syncIdentity();
    return () => {
      cancelled = true;
    };
  }, [consentRevision, session?.user?.createdAt, session?.user?.id, session?.user?.role, status]);

  return null;
}
