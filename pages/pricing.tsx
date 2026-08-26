import Link from "next/link";
import { useRouter } from "next/router";
import { signIn, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import SeoHead, { WEBSITE_ID, absoluteUrl } from "../components/SeoHead";
import {
  getOrCreatePremiumFunnelContext,
  normalizePremiumFunnelReason,
  normalizePremiumFunnelSource,
  premiumFunnelProperties,
  premiumPricingHref,
  type PremiumFunnelContext,
} from "../lib/premiumFunnel";
import {
  premiumOfferCtaLabel,
  premiumOfferReassurance,
  usePremiumOfferEligibility,
} from "../lib/usePremiumOfferEligibility";
import { premiumOfferExperimentProperties } from "../lib/premiumOfferExperiment";
import { usePremiumOfferExperiment } from "../lib/usePremiumOfferExperiment";

const pricingFaqs = [
  {
    question: "Can I try Premium before paying?",
    answer:
      "Eligible new subscribers get a 7-day trial. Premium is $5.99 per month and you can cancel anytime.",
  },
  {
    question: "Do both plans include Light and Heavy?",
    answer:
      "Yes. Light is faster for clear, focused guitar recordings. Heavy is our more accurate model for complex and multi-instrument recordings. Premium gives you more room to choose Heavy regularly.",
  },
  {
    question: "What happens to unused credits?",
    answer:
      "Premium credits roll over up to a balance of 200. Free credits refresh monthly and do not roll over.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. You can manage or cancel Premium from your account settings. Your access continues through the current billing period.",
  },
];

export default function PricingPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const resumedCheckoutRef = useRef(false);
  const pricingViewTrackedRef = useRef(false);
  const funnelContextRef = useRef<PremiumFunnelContext | null>(null);
  const currentRole = session?.user?.role || "";
  const hasPaidPremium = currentRole === "PREMIUM";
  const hasStaffAccess = ["ADMIN", "MODERATOR", "MOD"].includes(currentRole);
  const hasPremiumAccess = hasPaidPremium || hasStaffAccess;
  const { variant: offerVariant, resolved: offerVariantResolved } =
    usePremiumOfferExperiment(!hasPremiumAccess);
  const offerEligibility = usePremiumOfferEligibility(
    sessionStatus === "authenticated" && !hasPremiumAccess
  );
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
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: pricingFaqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ];

  const entrySource = normalizePremiumFunnelSource(router.query.source);
  const entryReason = normalizePremiumFunnelReason(router.query.reason);

  const getFunnelContext = useCallback(() => {
    if (funnelContextRef.current) return funnelContextRef.current;
    const rawFunnelId = Array.isArray(router.query.funnel_id)
      ? router.query.funnel_id[0]
      : router.query.funnel_id;
    funnelContextRef.current = getOrCreatePremiumFunnelContext({
      source: entrySource,
      reason: entryReason,
      funnelId: rawFunnelId,
    });
    return funnelContextRef.current;
  }, [entryReason, entrySource, router.query.funnel_id]);

  useEffect(() => {
    if (!router.isReady || !offerVariantResolved || pricingViewTrackedRef.current) return;
    pricingViewTrackedRef.current = true;
    const funnel = getFunnelContext();
    sendEvent(ANALYTICS_EVENTS.pricingViewed, {
      path: "/pricing",
      ...premiumFunnelProperties(funnel),
      ...premiumOfferExperimentProperties(offerVariant),
    });
  }, [getFunnelContext, offerVariant, offerVariantResolved, router.isReady]);

  const startCheckout = useCallback(async () => {
    if (checkoutBusy) return;
    const funnel = getFunnelContext();
    sendEvent(ANALYTICS_EVENTS.pricingCtaClicked, {
      cta: "premium_offer",
      signedIn: Boolean(session),
      path: "/pricing",
      ...premiumFunnelProperties(funnel),
      ...premiumOfferExperimentProperties(offerVariant),
    });
    if (!session) {
      const callbackUrl = `${premiumPricingHref(funnel)}&checkout=1`;
      await signIn(undefined, { callbackUrl });
      return;
    }
    if (hasPremiumAccess) {
      await router.push(hasPaidPremium ? "/settings" : "/transcribe");
      return;
    }

    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: funnel.source,
          reason: funnel.reason,
          funnelId: funnel.funnelId,
          offerVariant,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Could not start checkout.");
      }
      sendEvent(ANALYTICS_EVENTS.checkoutRedirected, {
        plan: "premium_monthly",
        checkout_attempt_id: payload.checkoutAttemptId,
        ...premiumFunnelProperties(funnel),
        ...premiumOfferExperimentProperties(offerVariant),
      });
      window.location.assign(payload.url);
    } catch (error) {
      sendEvent(ANALYTICS_EVENTS.checkoutClientFailed, {
        plan: "premium_monthly",
        ...premiumFunnelProperties(funnel),
        ...premiumOfferExperimentProperties(offerVariant),
      });
      setCheckoutError(error instanceof Error ? error.message : "Could not start checkout.");
      setCheckoutBusy(false);
    }
  }, [checkoutBusy, getFunnelContext, hasPaidPremium, hasPremiumAccess, offerVariant, router, session]);

  useEffect(() => {
    if (!router.isReady || router.query.checkout !== "1") return;
    if (!offerVariantResolved || sessionStatus !== "authenticated" || resumedCheckoutRef.current) return;
    resumedCheckoutRef.current = true;
    const funnel = getFunnelContext();
    void router.replace(premiumPricingHref(funnel), undefined, { shallow: true });
    void startCheckout();
  }, [getFunnelContext, offerVariantResolved, router.isReady, router.query.checkout, sessionStatus, startCheckout]);

  return (
    <>
      <SeoHead
        title="Pricing | Note2Tabs"
        description={description}
        canonicalPath="/pricing"
        jsonLd={pricingJsonLd}
      />
      <main className="page page-pricing">
        <section className="pricing-page">
          <div className="container pricing-page__container">
            <header className="pricing-page__hero">
              <h1>Choose how far you want to take your music.</h1>
              <p>
                Start free. Upgrade for more transcriptions, full songs, and
                more usage of the Heavy model.
              </p>
            </header>

            <section className="pricing-page__plans" aria-label="Note2Tabs plans">
              <article className="pricing-plan pricing-plan--free">
                <div className="pricing-plan__top">
                  <h2>Free</h2>
                  <div className="pricing-plan__price">
                    <strong>$0</strong>
                    <span>/ month</span>
                  </div>
                </div>
                <Link
                  href="/transcribe"
                  className="pricing-plan__cta pricing-plan__cta--secondary"
                  onClick={() =>
                    trackCtaClick("pricing_start_free", { surface: "pricing_page" })
                  }
                >
                  Start free
                </Link>
                <p className="pricing-plan__reassurance">No credit card required</p>
                <div className="pricing-plan__divider" />
                <ul className="pricing-plan__features">
                  <li><strong>10</strong> transcription credits each month</li>
                  <li>Light and Heavy transcription models</li>
                  <li>Audio clips up to 60 seconds</li>
                  <li>Uploads up to 50 MB</li>
                  <li>YouTube clips up to 30 seconds</li>
                  <li>Full guitar-tab editor and practice tools</li>
                </ul>
              </article>

              <article className="pricing-plan pricing-plan--premium">
                <div className="pricing-plan__badge">
                  {offerEligibility === "eligible"
                    ? offerVariant === "value_framing"
                      ? "Most popular · 7 days free"
                      : "Most popular · 7-day trial"
                    : "Most popular"}
                </div>
                <div className="pricing-plan__top">
                  <h2>Premium</h2>
                  <div className="pricing-plan__price">
                    <strong>$5.99</strong>
                    <span>/ month</span>
                  </div>
                </div>
                {hasPremiumAccess ? (
                  <Link
                    href={hasPaidPremium ? "/settings" : "/transcribe"}
                    className="pricing-plan__cta pricing-plan__cta--primary"
                  >
                    {hasPaidPremium ? "Manage current plan" : "Premium access included"}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="pricing-plan__cta pricing-plan__cta--primary"
                    onClick={() => void startCheckout()}
                    disabled={checkoutBusy || sessionStatus === "loading"}
                  >
                    {checkoutBusy
                      ? "Opening checkout…"
                      : premiumOfferCtaLabel(offerEligibility, "Get Premium", offerVariant)}
                  </button>
                )}
                <p className="pricing-plan__reassurance">
                  {premiumOfferReassurance(offerEligibility, offerVariant)}
                </p>
                <div className="pricing-plan__divider" />
                <ul className="pricing-plan__features">
                  <li><strong>100</strong> credits each month—10× more</li>
                  <li>Use the more accurate Heavy model regularly</li>
                  <li>Unused credits roll over, up to 200</li>
                  <li>Full-length audio-file transcription</li>
                  <li>Uploads up to 200 MB</li>
                  <li>Longer YouTube clips within the first 10 minutes</li>
                </ul>
              </article>
            </section>

            {checkoutError && (
              <div className="error pricing-page__error" role="alert">{checkoutError}</div>
            )}

            <section className="pricing-page__faq" aria-labelledby="pricing-faq-title">
              <div className="pricing-page__section-heading">
                <h2 id="pricing-faq-title">Questions before you start?</h2>
              </div>
              <div className="pricing-page__faq-list">
                {pricingFaqs.map((item) => (
                  <details key={item.question}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="pricing-page__final">
              <div>
                <h2>Turn the recording into something you can play.</h2>
              </div>
              <Link
                href="/transcribe"
                className="button-primary"
                onClick={() =>
                  trackCtaClick("pricing_final_transcribe", { surface: "pricing_page" })
                }
              >
                Start transcribing
              </Link>
            </section>
          </div>
        </section>
      </main>
    </>
  );
}
