import { useLocale } from "../../lib/i18n/react";
import { localeFromPath, localeHref } from "../../lib/i18n/locale";
import type { GetServerSideProps } from "next";
import Link from "../../components/LocaleLink";
import { useLocaleRouter as useRouter } from "../../lib/i18n/react";
import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import NoIndexHead from "../../components/NoIndexHead";
import { authOptions } from "../api/auth/[...nextauth]";
import { ANALYTICS_EVENTS, sendEvent } from "../../lib/analytics";
import {
  clearRecoverableCheckoutSessionId,
  confirmPremiumCheckout,
  getRecoverableCheckoutSessionId,
  hasPremiumEntitlement,
  hideCheckoutSessionIdFromAddressBar,
  waitForPremiumEntitlement,
} from "../../lib/premiumEntitlement";
import {
  isResumingTranscription,
  premiumWelcomeDestination,
  premiumWelcomePreviewAllowed,
} from "../../lib/premiumWelcome";
import { PLAN_CATALOG, effectiveSubscriptionPlan } from "../../lib/subscriptionPlans";

type WelcomeState = "checking" | "ready" | "delayed";

type Props = {
  previewMode: boolean;
};

export default function PremiumWelcomePage({ previewMode }: Props) {
  const { t, locale, href: localePath } = useLocale();
  const router = useRouter();
  const { data: session, status: sessionStatus, update } = useSession();
  const [state, setState] = useState<WelcomeState>(previewMode ? "ready" : "checking");
  const trackedRef = useRef(false);
  const confettiPlayedRef = useRef(false);
  const activationStartedRef = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const destination = useMemo(
    () => localePath(premiumWelcomeDestination(router.query.next)),
    [router.query.next, localePath]
  );
  const resumesUpload = isResumingTranscription(destination);
  const currentPlan = previewMode
    ? "PREMIUM"
    : effectiveSubscriptionPlan(session?.user?.role, session?.user?.subscriptionPlan);
  const plan = PLAN_CATALOG[currentPlan === "FREE" ? "PREMIUM" : currentPlan];

  useEffect(() => {
    if (state !== "ready" || confettiPlayedRef.current || typeof window === "undefined") return;
    confettiPlayedRef.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const timers: number[] = [];
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#0d755d", "#f0bd4f", "#f4e9cf", "#e56f51", "#6f9fd8", "#17221c"];
      const burst = (options: Parameters<typeof confetti>[0]) =>
        confetti({
          disableForReducedMotion: true,
          zIndex: 90,
          colors,
          ticks: 240,
          gravity: 0.92,
          decay: 0.94,
          scalar: 1.05,
          ...options,
        });

      burst({ particleCount: 115, spread: 82, startVelocity: 56, origin: { x: 0.5, y: 0.5 } });
      timers.push(window.setTimeout(() => {
        burst({ particleCount: 75, angle: 58, spread: 52, startVelocity: 52, origin: { x: 0.02, y: 0.72 } });
        burst({ particleCount: 75, angle: 122, spread: 52, startVelocity: 52, origin: { x: 0.98, y: 0.72 } });
      }, 160));
      timers.push(window.setTimeout(() => {
        burst({ particleCount: 48, spread: 110, startVelocity: 34, scalar: 0.8, origin: { x: 0.5, y: 0.28 } });
      }, 420));
    });

    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, [state]);

  useEffect(() => {
    if (!router.isReady || previewMode || sessionStatus === "loading") return;
    // Session hydration can rerender this page while checkout confirmation is
    // already in flight. Only one confirmation/refresh loop may own the state;
    // otherwise an older FREE-session response can overwrite the newer paid
    // session and incorrectly leave the customer on the delayed screen.
    if (activationStartedRef.current) return;
    activationStartedRef.current = true;
    let cancelled = false;
    const sessionIdValue = router.query.session_id;
    const sessionIdFromQuery = Array.isArray(sessionIdValue)
      ? sessionIdValue[0]
      : sessionIdValue;
    if (sessionIdFromQuery) hideCheckoutSessionIdFromAddressBar();
    const checkoutSessionId = sessionIdFromQuery || getRecoverableCheckoutSessionId();

    const activate = async () => {
      if (hasPremiumEntitlement(sessionRef.current)) {
        clearRecoverableCheckoutSessionId();
        if (!cancelled) setState("ready");
        return;
      }
      if (!checkoutSessionId) {
        // A previous confirmation may already have updated the database and
        // cleared the checkout ID while an older session response won the
        // client-side race. Refresh once so revisiting this page (or pressing
        // Check again) repairs that stale cookie-backed session.
        let refreshedSession = null;
        try {
          refreshedSession = await update();
        } catch {
          // The delayed state remains a safe, retryable fallback.
        }
        if (!cancelled) {
          setState(hasPremiumEntitlement(refreshedSession) ? "ready" : "delayed");
        }
        return;
      }
      const confirmed = await confirmPremiumCheckout(checkoutSessionId);
      const entitled = confirmed
        ? await waitForPremiumEntitlement(() => update(), {
            attempts: 12,
            intervalMs: 500,
            shouldStop: () => cancelled,
          })
        : false;
      if (cancelled) return;
      if (entitled) {
        clearRecoverableCheckoutSessionId();
        setState("ready");
      } else {
        setState("delayed");
      }
    };

    void activate();
    return () => {
      cancelled = true;
    };
  }, [previewMode, router.isReady, router.query.session_id, sessionStatus, update]);

  useEffect(() => {
    if (previewMode || state !== "ready" || trackedRef.current) return;
    trackedRef.current = true;
    sendEvent(ANALYTICS_EVENTS.premiumWelcomeViewed, {
      plan: plan.analyticsId,
      destination: resumesUpload ? "resume_transcription" : "transcriber",
    });
  }, [previewMode, resumesUpload, state]);

  const trackContinue = () => {
    if (previewMode) return;
    sendEvent(ANALYTICS_EVENTS.premiumWelcomeCtaClicked, {
      plan: plan.analyticsId,
      cta: "continue",
      destination: resumesUpload ? "resume_transcription" : "transcriber",
    });
  };

  return (
    <>
      <NoIndexHead title={`Welcome to ${plan.name} | Note2Tabs`} canonicalPath="/premium/welcome" />
      <main className="premium-welcome-page">
        <section className="premium-welcome-card" aria-live="polite">
          {previewMode && <span className="premium-welcome-preview">Preview</span>}
          <div className="premium-welcome-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="presentation">
              <circle className="premium-welcome-mark__halo" cx="32" cy="32" r="29" />
              <circle className="premium-welcome-mark__surface" cx="32" cy="32" r="23" />
              <path className="premium-welcome-mark__check" d="M21.5 31.5 29 39l15.5-16.5" />
            </svg>
          </div>

          {state === "checking" ? (
            <>
              <p className="premium-welcome-eyebrow">{t("Activating ")}{plan.name}</p>
              <h1>{t("Getting ")}{plan.name}{t(" ready…")}</h1>
              <p>{t("Your signup is complete. We’re syncing your new limits now.")}</p>
              <div className="premium-welcome-loader" aria-hidden="true" />
            </>
          ) : state === "delayed" ? (
            <>
              <p className="premium-welcome-eyebrow">{plan.name}{t(" is activating")}</p>
              <h1>{plan.name}{t(" is almost ready.")}</h1>
              <p>{t(" Your signup was confirmed, but your account is taking a little longer to update. No action is needed—check again in a moment. ")}</p>
              <button className="premium-welcome-primary" type="button" onClick={() => router.reload()}>{t(" Check again ")}</button>
              <Link className="premium-welcome-secondary" href="/settings">{t(" View plan settings ")}</Link>
            </>
          ) : (
            <>
              <h1>{t("You’re all set!")}</h1>
              <p>
                {currentPlan === "PRO"
                  ? t("Pro is active now, with more room for frequent transcription and the Heavy model.")
                  : t("Thanks for choosing Note2Tabs Premium. Premium is active, with more room for full songs, the Heavy model, and credits that roll over.")}
              </p>
              <div className="premium-welcome-access" aria-label={t("Premium access now available")}>
                <div><span>{t("Monthly capacity")}</span><strong>{plan.monthlyCredits}{t(" credits")}</strong></div>
                <div><span>{t("Credit rollover")}</span><strong>{t("Up to ")}{plan.rolloverCap}</strong></div>
                <div><span>{t("Audio uploads")}</span><strong>{t("Up to ")}{Math.round(plan.maxUploadBytes / 1024 / 1024)} MB</strong></div>
              </div>
              <Link className="premium-welcome-primary" href={destination} onClick={trackContinue}>
                {resumesUpload ? t("Continue your transcription") : t("Transcribe with {plan}", {plan: plan.name})}
              </Link>
              <Link className="premium-welcome-secondary" href="/gte">{t(" Go to my tabs ")}</Link>
            </>
          )}
        </section>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const previewMode =
    ctx.query.preview === "1" && premiumWelcomePreviewAllowed();
  if (previewMode) return { props: { previewMode: true } };

  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(ctx.resolvedUrl || "/premium/welcome");
    return { redirect: { destination: localeHref(`/auth/login?next=${callbackUrl}`, localeFromPath(ctx.resolvedUrl)), permanent: false } };
  }
  return { props: { session, previewMode: false } };
};
