import { useEffect, useState } from "react";
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

export default function AnalyticsIdentityLinker() {
  const { data: session, status } = useSession();
  const [consentRevision, setConsentRevision] = useState(0);

  useEffect(() => {
    const handleConsentChange = () => setConsentRevision((value) => value + 1);
    window.addEventListener("note2tabs:analytics-consent-changed", handleConsentChange);
    return () => window.removeEventListener("note2tabs:analytics-consent-changed", handleConsentChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
    let cancelled = false;

    const syncIdentity = async () => {
      if (status === "unauthenticated") {
        if (getPostHogIdentifiedUserId()) await resetPostHogIdentity();
        return;
      }
      if (status !== "authenticated" || !session?.user?.id) return;

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
      });
      const oauthIntent = takeOAuthIntent();
      const createdAtMs = session.user.createdAt ? Date.parse(session.user.createdAt) : Number.NaN;
      const isRecentlyCreated =
        Number.isFinite(createdAtMs) && Date.now() - createdAtMs >= 0 && Date.now() - createdAtMs < 10 * 60 * 1000;
      if (oauthIntent && isRecentlyCreated) {
        sendEvent(ANALYTICS_EVENTS.signupCompleted, {
          method: "google",
          destination: categorizeAnalyticsDestination(oauthIntent.next),
          initiatedAs: oauthIntent.intent,
        });
      } else if (oauthIntent) {
        sendEvent(ANALYTICS_EVENTS.loginSucceeded, {
          method: "google",
          destination: categorizeAnalyticsDestination(oauthIntent.next),
          initiatedAs: oauthIntent.intent,
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
