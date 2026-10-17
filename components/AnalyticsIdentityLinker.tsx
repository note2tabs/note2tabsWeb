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
import { getAnalyticsTrackingIds, getAnalyticsOwnerId, resetAnalyticsIdentity } from "../lib/analyticsV2";
import { premiumFunnelProperties, readPremiumFunnelContext } from "../lib/premiumFunnel";

const IDENTITY_LINK_STORAGE_PREFIX = "note2tabs:analytics-identity-linked:";

function hasPersistedIdentityLink(identityLinkKey: string) {
  try {
    return window.localStorage.getItem(`${IDENTITY_LINK_STORAGE_PREFIX}${identityLinkKey}`) === "1";
  } catch {
    return false;
  }
}

function persistIdentityLink(identityLinkKey: string) {
  try {
    window.localStorage.setItem(`${IDENTITY_LINK_STORAGE_PREFIX}${identityLinkKey}`, "1");
  } catch {
    // Storage is only a request-deduplication optimization.
  }
}

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
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const postHogConfigured = Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);

    const syncIdentity = async () => {
      const proxyOwner = getAnalyticsOwnerId();
      if (status === "unauthenticated") {
        if (proxyOwner) await resetAnalyticsIdentity();
        linkedIdentityRef.current = null;
        if (postHogConfigured && getPostHogIdentifiedUserId()) {
          await resetPostHogIdentity();
        }
        return;
      }
      if (status !== "authenticated" || !session?.user?.id) return;

      if (proxyOwner && proxyOwner !== session.user.id) await resetAnalyticsIdentity();
      if (cancelled) return;
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
      const pendingOAuthIntent = takeOAuthIntent(false);
      const trackingIds = getAnalyticsTrackingIds();
      const funnel = readPremiumFunnelContext();
      const identityLinkKey = `${session.user.id}:${trackingIds?.anonId || "no-anon"}`;
      if (
        linkedIdentityRef.current !== identityLinkKey &&
        !hasPersistedIdentityLink(identityLinkKey)
      ) {
        linkedIdentityRef.current = identityLinkKey;
        try {
          const response = await fetch("/api/analytics/link-identity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: pendingOAuthIntent?.intent === "signup" ? "signup" : "login",
              anonId: trackingIds?.anonId,
              sessionId: trackingIds?.sessionId,
              funnelId: funnel?.funnelId,
              funnelSource: funnel?.source,
              funnelReason: funnel?.reason,
            }),
            keepalive: true,
          });
          if (response.ok) persistIdentityLink(identityLinkKey);
          else throw new Error("Identity link not accepted");
        } catch {
          linkedIdentityRef.current = null;
          retryTimer = setTimeout(() => setConsentRevision(value => value + 1), 10_000);
          // Identity measurement must never interrupt authentication.
        }
      }
      if (cancelled) return;
      const oauthIntent = takeOAuthIntent();
      if (oauthIntent) {
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
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [consentRevision, session?.user?.createdAt, session?.user?.id, session?.user?.role, status]);

  return null;
}
