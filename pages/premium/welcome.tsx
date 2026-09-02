import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
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

type WelcomeState = "checking" | "ready" | "delayed";

type Props = {
  previewMode: boolean;
};

export default function PremiumWelcomePage({ previewMode }: Props) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [state, setState] = useState<WelcomeState>(previewMode ? "ready" : "checking");
  const trackedRef = useRef(false);
  const confettiPlayedRef = useRef(false);
  const destination = useMemo(
    () => premiumWelcomeDestination(router.query.next),
    [router.query.next]
  );
  const resumesUpload = isResumingTranscription(destination);

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
    if (!router.isReady || previewMode) return;
    let cancelled = false;
    const sessionIdValue = router.query.session_id;
    const sessionIdFromQuery = Array.isArray(sessionIdValue)
      ? sessionIdValue[0]
      : sessionIdValue;
    if (sessionIdFromQuery) hideCheckoutSessionIdFromAddressBar();
    const checkoutSessionId = sessionIdFromQuery || getRecoverableCheckoutSessionId();

    const activate = async () => {
      if (hasPremiumEntitlement(session)) {
        clearRecoverableCheckoutSessionId();
        if (!cancelled) setState("ready");
        return;
      }
      if (!checkoutSessionId) {
        if (!cancelled) setState("delayed");
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
  }, [previewMode, router.isReady, router.query.session_id, session, update]);

  useEffect(() => {
    if (previewMode || state !== "ready" || trackedRef.current) return;
    trackedRef.current = true;
    sendEvent(ANALYTICS_EVENTS.premiumWelcomeViewed, {
      destination: resumesUpload ? "resume_transcription" : "transcriber",
    });
  }, [previewMode, resumesUpload, state]);

  const trackContinue = () => {
    if (previewMode) return;
    sendEvent(ANALYTICS_EVENTS.premiumWelcomeCtaClicked, {
      cta: "continue",
      destination: resumesUpload ? "resume_transcription" : "transcriber",
    });
  };

  return (
    <>
      <NoIndexHead title="Welcome to Premium | Note2Tabs" canonicalPath="/premium/welcome" />
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
              <p className="premium-welcome-eyebrow">Activating Premium</p>
              <h1>Getting Premium ready…</h1>
              <p>Your signup is complete. We’re syncing your new limits now.</p>
              <div className="premium-welcome-loader" aria-hidden="true" />
            </>
          ) : state === "delayed" ? (
            <>
              <p className="premium-welcome-eyebrow">Premium is activating</p>
              <h1>Premium is almost ready.</h1>
              <p>
                Your signup was confirmed, but your account is taking a little longer to update.
                No action is needed—check again in a moment.
              </p>
              <button className="premium-welcome-primary" type="button" onClick={() => router.reload()}>
                Check again
              </button>
              <Link className="premium-welcome-secondary" href="/settings">
                View plan settings
              </Link>
            </>
          ) : (
            <>
              <h1>You’re all set!</h1>
              <p>
                Thanks for choosing Note2Tabs Premium. Your trial is active, with more room for
                full songs, the Heavy model, and credits that roll over.
              </p>
              <div className="premium-welcome-access" aria-label="Premium access now available">
                <div><span>Monthly capacity</span><strong>100 credits</strong></div>
                <div><span>Credit rollover</span><strong>Up to 200</strong></div>
                <div><span>Audio uploads</span><strong>Full songs</strong></div>
              </div>
              <Link className="premium-welcome-primary" href={destination} onClick={trackContinue}>
                {resumesUpload ? "Continue your transcription" : "Transcribe with Premium"}
              </Link>
              <Link className="premium-welcome-secondary" href="/gte">
                Go to my tabs
              </Link>
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
    return { redirect: { destination: `/auth/login?next=${callbackUrl}`, permanent: false } };
  }
  return { props: { session, previewMode: false } };
};
