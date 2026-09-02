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
} from "../../lib/premiumWelcome";

type WelcomeState = "checking" | "ready" | "delayed";

const CONFETTI = Array.from({ length: 28 }, (_, index) => ({
  left: `${5 + ((index * 37) % 90)}%`,
  delay: `${(index % 8) * 55}ms`,
  duration: `${1050 + (index % 5) * 110}ms`,
  color: ["#0d755d", "#d6a84b", "#111713", "#87b9aa", "#df765d"][index % 5],
  rotate: `${(index * 47) % 180}deg`,
}));

export default function PremiumWelcomePage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [state, setState] = useState<WelcomeState>("checking");
  const trackedRef = useRef(false);
  const destination = useMemo(
    () => premiumWelcomeDestination(router.query.next),
    [router.query.next]
  );
  const resumesUpload = isResumingTranscription(destination);

  useEffect(() => {
    if (!router.isReady) return;
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
  }, [router.isReady, router.query.session_id, session, update]);

  useEffect(() => {
    if (state !== "ready" || trackedRef.current) return;
    trackedRef.current = true;
    sendEvent(ANALYTICS_EVENTS.premiumWelcomeViewed, {
      destination: resumesUpload ? "resume_transcription" : "transcriber",
    });
  }, [resumesUpload, state]);

  const trackContinue = () => {
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
          {state === "ready" && (
            <div className="premium-welcome-confetti" aria-hidden="true">
              {CONFETTI.map((piece, index) => (
                <i
                  key={index}
                  style={{
                    left: piece.left,
                    animationDelay: piece.delay,
                    animationDuration: piece.duration,
                    backgroundColor: piece.color,
                    transform: `rotate(${piece.rotate})`,
                  }}
                />
              ))}
            </div>
          )}

          <div className="premium-welcome-mark" aria-hidden="true">
            <span>✓</span>
          </div>

          {state === "checking" ? (
            <>
              <p className="premium-welcome-eyebrow">Completing your upgrade</p>
              <h1>Getting Premium ready…</h1>
              <p>Your purchase is complete. We’re syncing your new limits now.</p>
              <div className="premium-welcome-loader" aria-hidden="true" />
            </>
          ) : state === "delayed" ? (
            <>
              <p className="premium-welcome-eyebrow">Thank you for upgrading</p>
              <h1>Premium is almost ready.</h1>
              <p>
                Stripe confirmed your purchase, but your account is taking a little longer to
                update. Your payment is safe—try opening the transcriber in a moment.
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
              <p className="premium-welcome-eyebrow">You’re now a Premium member</p>
              <h1>Thank you for supporting Note2Tabs.</h1>
              <p>
                Your 100 monthly credits, rollover, longer uploads, and greater Heavy-model
                capacity are ready to use.
              </p>
              <div className="premium-welcome-benefits" aria-label="Premium benefits">
                <span>100 monthly credits</span>
                <span>Up to 200 with rollover</span>
                <span>Full-song uploads</span>
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
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(ctx.resolvedUrl || "/premium/welcome");
    return { redirect: { destination: `/auth/login?next=${callbackUrl}`, permanent: false } };
  }
  return { props: { session } };
};
