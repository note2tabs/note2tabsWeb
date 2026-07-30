import Link from "next/link";
import { useRouter } from "next/router";
import { signIn, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import SeoHead, { WEBSITE_ID, absoluteUrl } from "../components/SeoHead";

export default function PricingPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const resumedCheckoutRef = useRef(false);
  const currentRole = session?.user?.role || "";
  const hasPaidPremium = currentRole === "PREMIUM";
  const hasStaffAccess = ["ADMIN", "MODERATOR", "MOD"].includes(currentRole);
  const hasPremiumAccess = hasPaidPremium || hasStaffAccess;
  const description =
    "Simple monthly pricing for Note2Tabs. Compare free and premium plans for guitar tab transcription and editing.";
  const pricingJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Note2Tabs Pricing",
      url: absoluteUrl("/pricing"),
      description,
      isPartOf: { "@id": WEBSITE_ID },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Pricing",
          item: absoluteUrl("/pricing"),
        },
      ],
    },
  ];

  useEffect(() => {
    sendEvent(ANALYTICS_EVENTS.pricingViewed, { path: "/pricing" });
  }, []);

  const startCheckout = useCallback(async () => {
    if (checkoutBusy) return;
    sendEvent(ANALYTICS_EVENTS.pricingCtaClicked, {
      cta: "premium_trial",
      signedIn: Boolean(session),
      path: "/pricing",
    });
    if (!session) {
      await signIn(undefined, { callbackUrl: "/pricing?checkout=1" });
      return;
    }
    if (hasPremiumAccess) {
      await router.push(hasPaidPremium ? "/settings" : "/transcribe");
      return;
    }

    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const response = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Could not start checkout.");
      }
      sendEvent(ANALYTICS_EVENTS.checkoutStarted, {
        source: "pricing_page",
        plan: "premium_monthly",
      });
      window.location.assign(payload.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Could not start checkout.");
      setCheckoutBusy(false);
    }
  }, [checkoutBusy, hasPaidPremium, hasPremiumAccess, router, session]);

  useEffect(() => {
    if (!router.isReady || router.query.checkout !== "1") return;
    if (sessionStatus !== "authenticated" || resumedCheckoutRef.current) return;
    resumedCheckoutRef.current = true;
    void router.replace("/pricing", undefined, { shallow: true });
    void startCheckout();
  }, [router.isReady, router.query.checkout, sessionStatus, startCheckout]);

  return (
    <>
      <SeoHead title="Pricing | Note2Tabs" description={description} canonicalPath="/pricing" jsonLd={pricingJsonLd} />
      <main className="page page-pricing">
        <section className="pricing">
          <div className="container stack">
            <div className="page-header">
              <div>
                <h1 className="page-title">Pricing</h1>
                <p className="page-subtitle">
                  Compare Free and Premium plans for credits, speed, clip length, and upload limits.
                </p>
              </div>
              <Link
                href="/transcribe"
                className="button-secondary button-small"
                onClick={() => trackCtaClick("pricing_back_to_app", { surface: "pricing_page" })}
              >
                Start transcribing
              </Link>
            </div>

            <section className="pricing-model-story" aria-labelledby="pricing-model-title">
              <div className="pricing-model-story__intro">
                <span className="pricing-model-story__eyebrow">Two transcription models</span>
                <h2 id="pricing-model-title">Use Heavy when accuracy matters most.</h2>
                <p>
                  Both plans include Light and Heavy. Premium gives you the credits to use
                  our highest-accuracy model much more often.
                </p>
              </div>
              <div className="pricing-model-comparison">
                <div className="pricing-model-option">
                  <div>
                    <h3>Light</h3>
                    <span>Fast</span>
                  </div>
                  <p>For clear, focused guitar recordings.</p>
                  <strong>2 credits / 30 sec</strong>
                </div>
                <div className="pricing-model-option pricing-model-option--heavy">
                  <div>
                    <h3>Heavy</h3>
                    <span>Highest accuracy</span>
                  </div>
                  <p>For complex and multi-instrument recordings.</p>
                  <strong>3 credits / 30 sec</strong>
                </div>
              </div>
              <div className="pricing-heavy-usage" aria-label="Heavy model monthly usage comparison">
                <div>
                  <span>Free</span>
                  <strong>About 3</strong>
                  <small>30-second Heavy clips / month</small>
                </div>
                <div>
                  <span>Premium</span>
                  <strong>About 16</strong>
                  <small>30-second Heavy clips / month</small>
                </div>
              </div>
            </section>

            <div className="pricing-grid">
              <div className="pricing-card pricing-card--free">
                <div className="pricing-header">
                  <div>
                    <h2>Free</h2>
                    <p className="muted text-small">Core features with lower limits.</p>
                  </div>
                  <div className="pricing-price">
                    <span className="pricing-amount">$0</span>
                    <span className="pricing-interval">/ month</span>
                  </div>
                </div>
                <ul className="pricing-list">
                  <li>10 credits per month</li>
                  <li>Light and Heavy transcription models</li>
                  <li>About 3 Heavy 30-second clips per month</li>
                  <li>Standard speed</li>
                  <li>Upload size 50 MB</li>
                  <li>Audio clips up to 60 s</li>
                  <li>YouTube clips up to 30 s</li>
                </ul>
              </div>

              <div className="pricing-card pricing-card--premium pricing-card--trial">
                <span className="pricing-trial-ribbon">7-day trial for new subscribers</span>
                <div className="pricing-header">
                  <div>
                    <h2>Premium</h2>
                    <p className="muted text-small">Higher limits with faster processing.</p>
                  </div>
                  <div className="pricing-price">
                    <span className="pricing-amount">$5.99</span>
                    <span className="pricing-interval">/ month</span>
                  </div>
                </div>
                <ul className="pricing-list">
                  <li>50 credits per month—5× more than Free</li>
                  <li>About 16 Heavy 30-second clips per month</li>
                  <li>Unused credits roll over, up to 100</li>
                  <li>Extra speed</li>
                  <li>Upload size 200 MB</li>
                  <li>Full-length audio-file transcription</li>
                  <li>YouTube clips up to 30 s</li>
                </ul>
                {hasPremiumAccess ? (
                  <Link href={hasPaidPremium ? "/settings" : "/transcribe"} className="pricing-card-cta">
                    {hasPaidPremium ? "Manage current plan" : "Premium access included"}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="pricing-card-cta"
                    onClick={() => void startCheckout()}
                    disabled={checkoutBusy || sessionStatus === "loading"}
                  >
                    {checkoutBusy ? "Opening checkout…" : "Upgrade to Premium"}
                  </button>
                )}
              </div>
            </div>
            {checkoutError && <div className="error" role="alert">{checkoutError}</div>}
          </div>
        </section>
      </main>
    </>
  );
}
