import { PRICING_LAYOUT_VERSION, priceUsd, planPrice, annualSavings } from "../lib/pricingPresentation";
import { MAX_FREE_FILE_SNIPPET_SEC, MAX_FREE_YOUTUBE_SNIPPET_SEC } from "../lib/transcriptionClip";
import { CREDIT_INTERVAL_SEC } from "../lib/credits";
import { calculateTranscriptionCredits, getTranscriptionModelCreditsPerInterval } from "../lib/transcriptionModels";
import { parseUserAgent } from "../lib/analyticsV2/ua";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
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
  usePremiumOfferEligibility,
} from "../lib/usePremiumOfferEligibility";
import { premiumOfferExperimentProperties } from "../lib/premiumOfferExperiment";
import { usePremiumOfferExperiment } from "../lib/usePremiumOfferExperiment";
import { PLAN_CATALOG, effectiveSubscriptionPlan, proPlanPresentationEnabled, type PaidSubscriptionPlan } from "../lib/subscriptionPlans";
import type { BillingInterval } from "../lib/stripePremium";

const pricingFaqs = [
  { question: "How do transcription credits work?", answer: `Each started ${CREDIT_INTERVAL_SEC}-second segment costs ${getTranscriptionModelCreditsPerInterval("light")} credits with Light or ${getTranscriptionModelCreditsPerInterval("heavy")} with Heavy. A 60-second recording costs ${calculateTranscriptionCredits(60, "light")} Light credits or ${calculateTranscriptionCredits(60, "heavy")} Heavy credits. Light is faster for clear guitar recordings; Heavy handles more complex recordings.` },
  { question: "How does billing work?", answer: "Your subscription is charged when you subscribe. Monthly plans renew each month; yearly plans renew annually." },
  { question: "Can I cancel anytime?", answer: "Yes. Cancel in account settings to stop your next renewal. Access continues through the current billing period." },
];

export default function PricingPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [busyPlan, setBusyPlan] = useState<PaidSubscriptionPlan | null>(null);
  const checkoutBusy = busyPlan !== null;
  const checkoutLock = useRef(false);
  const [selectedPlan, setSelectedPlan] = useState<PaidSubscriptionPlan>("PREMIUM");
  const [compact, setCompact] = useState(false);
  const cancelTracked = useRef(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const resumedCheckoutRef = useRef(false);
  const pricingViewTrackedRef = useRef(false);
  const funnelContextRef = useRef<PremiumFunnelContext | null>(null);
  const currentRole = session?.user?.role || "";
  const showPro = proPlanPresentationEnabled();
  const hasPaidPremium = currentRole === "PREMIUM" || (session?.user?.subscriptionPlan === "PRO") || (session?.user?.subscriptionPlan === "PREMIUM");
  const currentPlan = effectiveSubscriptionPlan(currentRole, session?.user?.subscriptionPlan);
  const hasStaffAccess = ["ADMIN", "MODERATOR", "MOD"].includes(currentRole);
  const hasPremiumAccess = hasPaidPremium || hasStaffAccess;
  const { variant: offerVariant, resolved: offerVariantResolved } =
    usePremiumOfferExperiment(!hasPremiumAccess);
  const offerEligibility = usePremiumOfferEligibility(
    sessionStatus === "authenticated" && !hasPremiumAccess
  );
  const description =
    "Monthly and yearly pricing for Note2Tabs. Compare Free, Premium, and Pro plans for guitar tab transcription and editing.";
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
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Note2Tabs",
      offers: {
        "@type": "OfferCatalog",
        name: "Note2Tabs subscription plans",
        itemListElement: [
          ...(["FREE", "PREMIUM", ...(showPro ? ["PRO"] : [])] as Array<keyof typeof PLAN_CATALOG>).flatMap((id) => {
            const plan = PLAN_CATALOG[id];
            return [{ "@type": "Offer", name: plan.name, price: String(plan.monthlyPriceUsd), priceCurrency: "USD" },
              ...(id === "FREE" ? [] : [{ "@type": "Offer", name: `${plan.name} yearly`, price: String(plan.yearlyPriceUsd), priceCurrency: "USD" }])];
          }),
        ],
      },
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

  const presentationProperties = useCallback(() => ({
    pricing_layout_version: PRICING_LAYOUT_VERSION, signedIn: Boolean(session),
    current_plan: currentPlan.toLowerCase(), trial_eligibility: offerEligibility,
    billing_interval: billingInterval,
    device_type: typeof navigator === "undefined" ? "unknown" : parseUserAgent(navigator.userAgent).deviceType,
  }), [session, currentPlan, offerEligibility, billingInterval]);

  useEffect(() => {
    if (!router.isReady || sessionStatus === "loading" || !offerVariantResolved || pricingViewTrackedRef.current) return;
    pricingViewTrackedRef.current = true;
    const funnel = getFunnelContext();
    sendEvent(ANALYTICS_EVENTS.pricingViewed, {
      path: "/pricing",
      ...presentationProperties(),
      ...premiumFunnelProperties(funnel),
      ...premiumOfferExperimentProperties(offerVariant),
    });
  }, [getFunnelContext, offerVariant, offerVariantResolved, router.isReady, sessionStatus, presentationProperties]);

  const startCheckout = useCallback(async (plan: PaidSubscriptionPlan = "PREMIUM", resumed = false) => {
    if (checkoutLock.current || sessionStatus === "loading") return;
    checkoutLock.current = true;
    setBusyPlan(plan); setSelectedPlan(plan); setCheckoutError(null);
    const funnel = getFunnelContext();
    const properties = { ...presentationProperties(), ...premiumFunnelProperties(funnel), ...premiumOfferExperimentProperties(offerVariant), plan: plan.toLowerCase(), path: "/pricing" };
    let httpStatus: number | undefined;
    let stage = "auth_navigation";
    try {
      sendEvent(resumed ? ANALYTICS_EVENTS.pricingCheckoutResumed : ANALYTICS_EVENTS.pricingCtaClicked, { ...properties, cta: plan === "PRO" ? "pro_offer" : "premium_offer" });
      if (!session) {
        const callbackUrl = `${premiumPricingHref(funnel)}&checkout=1&plan=${plan.toLowerCase()}&billing=${billingInterval}`;
        sendEvent(ANALYTICS_EVENTS.pricingAuthHandoff, properties);
        if (!await router.push(`/auth/signup?next=${encodeURIComponent(callbackUrl)}`)) throw new Error("Could not open sign up. Please try again.");
        return;
      }
      if (hasStaffAccess || (hasPaidPremium && currentPlan === plan)) {
        await router.push(hasPaidPremium ? "/settings" : "/transcribe"); return;
      }
      stage = "checkout_request";
      const response = await fetch(hasPaidPremium ? "/api/stripe/change-plan" : "/api/stripe/create-checkout-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: funnel.source, reason: funnel.reason, funnelId: funnel.funnelId, offerVariant, plan: plan.toLowerCase(), billingInterval, returnTo: "pricing", pricingLayoutVersion: PRICING_LAYOUT_VERSION }),
      });
      httpStatus = response.status;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || (!hasPaidPremium && !payload?.url)) throw new Error(payload?.error || "Checkout is temporarily unavailable. Please try again.");
      sendEvent(ANALYTICS_EVENTS.checkoutRedirected, { ...properties, plan: `${plan.toLowerCase()}_${billingInterval}`, checkout_attempt_id: payload.checkoutAttemptId });
      if (payload.url) window.location.assign(payload.url);
      else await router.push("/settings?planChanged=1");
    } catch (error) {
      sendEvent(ANALYTICS_EVENTS.checkoutClientFailed, { ...properties, failure_category: stage, http_status: httpStatus });
      setCheckoutError(error instanceof Error ? error.message : "Please check your connection and try again.");
    } finally { checkoutLock.current = false; setBusyPlan(null); }
  }, [sessionStatus, presentationProperties, billingInterval, currentPlan, getFunnelContext, hasPaidPremium, hasStaffAccess, offerVariant, router, session]);

  useEffect(() => {
    if (!router.isReady || router.query.checkout !== "1") return;
    if (!offerVariantResolved || sessionStatus !== "authenticated" || resumedCheckoutRef.current) return;
    const requestedBilling = router.query.billing === "yearly" ? "yearly" : "monthly";
    if (billingInterval !== requestedBilling) {
      setBillingInterval(requestedBilling);
      return;
    }
    resumedCheckoutRef.current = true;
    const funnel = getFunnelContext();
    void router.replace(premiumPricingHref(funnel), undefined, { shallow: true });
    void startCheckout(router.query.plan === "pro" && showPro ? "PRO" : "PREMIUM", true);
  }, [billingInterval, getFunnelContext, offerVariantResolved, router.isReady, router.query.billing, router.query.checkout, router.query.plan, sessionStatus, startCheckout, showPro]);

  useEffect(() => {
    if (!router.isReady || router.query.upgrade !== "cancel") return;
    const billing = router.query.billing === "yearly" ? "yearly" : "monthly";
    setBillingInterval(billing);
    setSelectedPlan(router.query.plan === "pro" && showPro ? "PRO" : "PREMIUM");
    if (!cancelTracked.current && offerVariantResolved) {
      cancelTracked.current = true;
      sendEvent(ANALYTICS_EVENTS.pricingCheckoutCancelled, { ...presentationProperties(), billing_interval: billing, ...premiumFunnelProperties(getFunnelContext()), ...premiumOfferExperimentProperties(offerVariant) });
    }
  }, [router.isReady, router.query.upgrade, router.query.billing, router.query.plan, showPro, offerVariantResolved, offerVariant, getFunnelContext, presentationProperties]);

  const selectBilling = (interval: BillingInterval) => {
    setBillingInterval(interval);
    sendEvent(ANALYTICS_EVENTS.pricingBillingSelected, { ...presentationProperties(), billing_interval: interval, ...premiumFunnelProperties(getFunnelContext()), ...premiumOfferExperimentProperties(offerVariant) });
  };
  const planOrder = compact ? ["PREMIUM", "FREE", ...(showPro ? ["PRO"] : [])] : ["FREE", "PREMIUM", ...(showPro ? ["PRO"] : [])];
  const faqs = pricingFaqs;
  return <>
    <SeoHead title="Pricing | Note2Tabs" description={description} canonicalPath="/pricing" jsonLd={pricingJsonLd.map((item) => item["@type"] === "FAQPage" ? { ...item, mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) } : item)} />
    <main className="page page-pricing"><section className="pricing-page pricing-page--focused"><div className="container pricing-page__container">
      <header className="pricing-page__hero"><h1>More music. More room to transcribe.</h1></header>
      <div className="pricing-billing-toggle" role="group" aria-label="Billing interval">
        {(["monthly", "yearly"] as const).map((interval) => <button key={interval} type="button" aria-pressed={billingInterval === interval} className={billingInterval === interval ? "is-active" : ""} onClick={() => selectBilling(interval)} disabled={checkoutBusy}>{interval === "monthly" ? "Monthly" : "Yearly"}</button>)}
      </div>
      {router.query.upgrade === "cancel" && <p className="pricing-return-message" role="status">Checkout cancelled. Your selected plan is ready if you want to try again.</p>}
      <section className={`pricing-page__plans${showPro ? " pricing-page__plans--three" : ""}`} aria-label="Note2Tabs plans">
        {planOrder.map((id) => {
          const plan = PLAN_CATALOG[id as keyof typeof PLAN_CATALOG];
          const paid = plan.id !== "FREE";
          const paidId = plan.id as PaidSubscriptionPlan;
          const included = hasStaffAccess && paid;
          const current = currentPlan === plan.id && paid;
          return <article key={plan.id} className={`pricing-plan pricing-plan--${plan.id.toLowerCase()}`}>
            {plan.id === "PREMIUM" && <div className="pricing-plan__badge">Recommended</div>}
            <div className="pricing-plan__top"><h2>{plan.name}</h2>
              <p>{plan.id === "FREE" ? "Try short recordings." : plan.id === "PREMIUM" ? "For full songs." : "For frequent transcription."}</p>
              <div className="pricing-plan__price"><strong>{paid ? priceUsd(planPrice(paidId, billingInterval)) : "$0"}</strong><span>/ {paid && billingInterval === "yearly" ? "year" : "month"}</span></div>
              {paid && billingInterval === "yearly" && <p className="pricing-plan__saving"><span className="pricing-plan__saving-amount">Save {priceUsd(annualSavings(paidId))} per year</span> · Billed annually</p>}
            </div>
            {!paid ? <Link href="/transcribe" className="pricing-plan__cta pricing-plan__cta--secondary" onClick={() => trackCtaClick("pricing_start_free", { surface: "pricing_page", ...presentationProperties() })}>Start free</Link>
              : included || current ? <Link href={included ? "/transcribe" : "/settings"} className="pricing-plan__cta pricing-plan__cta--secondary">{included ? `${plan.name} access included` : "Manage current plan"}</Link>
              : <button type="button" className={`pricing-plan__cta pricing-plan__cta--${plan.id === "PREMIUM" ? "primary" : "secondary"}`} onClick={() => void startCheckout(paidId)} disabled={checkoutBusy || sessionStatus === "loading"}>{busyPlan === plan.id ? "Opening checkout…" : hasPaidPremium ? `Switch to ${plan.name}` : plan.id === "PREMIUM" ? "Get Premium" : "Choose Pro"}</button>}
            <div className="pricing-plan__reassurance">
              {!paid ? "No credit card required" : included || current ? "Manage your subscription in your account." : <>
                {priceUsd(planPrice(paidId, billingInterval))}/{billingInterval === "yearly" ? "year" : "month"} billed today. Cancel anytime.
              </>}
            </div>
            {checkoutError && selectedPlan === plan.id && <div className="pricing-inline-error" role="alert"><p>{checkoutError}</p><button type="button" onClick={() => void startCheckout(paidId)} disabled={checkoutBusy}>Try again</button></div>}
            <div className="pricing-plan__divider" />
            <ul className="pricing-plan__features">
              <li><strong>{plan.monthlyCredits}</strong> credits every month</li>
              <li>{paid ? "Full-length audio-file transcription" : `Audio clips up to ${MAX_FREE_FILE_SNIPPET_SEC} seconds`}</li>
              <li>{paid ? `Credits roll over, up to ${plan.rolloverCap}` : "No credit rollover"}</li>
              <li>{plan.id === "PRO" ? "Everything in Premium + priority email support" : "Light and Heavy models, tab editor and practice tools"}</li>
            </ul>
          </article>;
        })}
      </section>
      <p className="pricing-credit-note">A 60-second recording uses {calculateTranscriptionCredits(60, "light")} credits with Light or {calculateTranscriptionCredits(60, "heavy")} with Heavy. Credits refresh monthly.</p>
      <details className="pricing-comparison"><summary>Compare all limits</summary><div className="pricing-comparison-scroll"><table><caption>Recording and upload limits</caption><thead><tr><th scope="col">Limit</th>{["FREE", "PREMIUM", ...(showPro ? ["PRO"] : [])].map((id) => <th scope="col" key={id}>{PLAN_CATALOG[id as keyof typeof PLAN_CATALOG].name}</th>)}</tr></thead><tbody>
        <tr><th scope="row">Upload size</th>{["FREE", "PREMIUM", ...(showPro ? ["PRO"] : [])].map((id) => <td key={id}>{PLAN_CATALOG[id as keyof typeof PLAN_CATALOG].maxUploadBytes / (1024 * 1024)} MB</td>)}</tr>
        <tr><th scope="row">YouTube clip length</th><td>Up to {MAX_FREE_YOUTUBE_SNIPPET_SEC} seconds</td><td>Within selected window</td>{showPro && <td>Within selected window</td>}</tr>
        <tr><th scope="row">YouTube selection window</th>{["FREE", "PREMIUM", ...(showPro ? ["PRO"] : [])].map((id) => <td key={id}>First {PLAN_CATALOG[id as keyof typeof PLAN_CATALOG].youtubePositionLimitSeconds / 60} minutes</td>)}</tr>
      </tbody></table></div><p>Light is faster for clear guitar recordings. Heavy is designed for complex and multi-instrument recordings. Both are available on every plan.</p></details>
      <section className="pricing-page__faq" aria-labelledby="pricing-faq-title"><div className="pricing-page__section-heading"><h2 id="pricing-faq-title">Questions before you start?</h2></div><div className="pricing-page__faq-list">{faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div></section>
      <p className="pricing-status" role="status" aria-live="polite">{busyPlan ? `Opening ${PLAN_CATALOG[busyPlan].name} checkout…` : ""}</p>
    </div></section></main>
  </>;
}
