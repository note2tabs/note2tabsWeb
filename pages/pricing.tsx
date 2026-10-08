import { localizedSignIn as signIn } from "../lib/i18n/auth";
import { translatedError } from "../lib/i18n/translate";
import { useLocale } from "../lib/i18n/react";
import { pricingMeasurementContext } from "../lib/pricingMeasurement";
import { MAX_FREE_FILE_SNIPPET_SEC, MAX_FREE_YOUTUBE_SNIPPET_SEC } from "../lib/transcriptionClip";
import { calculateTranscriptionCredits } from "../lib/transcriptionModels";
import Link from "../components/LocaleLink";
import { useLocaleRouter as useRouter } from "../lib/i18n/react";
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
import { PLAN_CATALOG, proPlanPresentationEnabled, type PaidSubscriptionPlan } from "../lib/subscriptionPlans";
import type { BillingInterval } from "../lib/stripePremium";
import { buildPricingProductStructuredData } from "../lib/pricingStructuredData";
import { rememberCheckoutAttempt } from "../lib/checkoutTracking";
import { formatLocalizedAmount as rawAmount, formatLocalizedPrice as rawPrice, localizedAnnualSaving as rawSaving, readDisplayCurrencyCookie } from "../lib/localizedPricing";
import { useDisplayCurrency } from "../lib/useDisplayCurrency";
import { markPremiumPricingVisited } from "../lib/premiumPromptSignals";

export default function PricingPage() {
  const { t, locale, href: localePath } = useLocale();
  const localizedAnnualSaving = (...args: Parameters<typeof rawSaving>) => rawSaving(args[0], args[1], locale);
  const formatLocalizedPrice = (...args: Parameters<typeof rawPrice>) => rawPrice(args[0], args[1], args[2], locale);
  const formatLocalizedAmount = (...args: Parameters<typeof rawAmount>) => rawAmount(args[0], args[1], locale);
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const displayCurrency = useDisplayCurrency();
  const resumedCheckoutRef = useRef(false);
  const pricingViewTrackedRef = useRef(false);
  const funnelContextRef = useRef<PremiumFunnelContext | null>(null);
  const currentRole = session?.user?.role || "";
  const showPro = proPlanPresentationEnabled();
  const hasPaidPremium = currentRole === "PREMIUM";
  const currentPlan = session?.user?.subscriptionPlan || (hasPaidPremium ? "PREMIUM" : "FREE");
  const hasStaffAccess = ["ADMIN", "MODERATOR", "MOD"].includes(currentRole);
  const hasPremiumAccess = hasPaidPremium || hasStaffAccess;
  const { variant: offerVariant, resolved: offerVariantResolved } =
    usePremiumOfferExperiment(!hasPremiumAccess);
  const offerEligibility = usePremiumOfferEligibility(
    sessionStatus === "authenticated" && !hasPremiumAccess
  );
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const pricingFaqs = [
    { question: t("Which transcription models does each plan include?"), answer: t("Free includes Light and a one-time Heavy preview. {plans}. Light handles guitar and multi-instrument recordings, and Heavy is our most detailed model for complex, multi-instrument recordings.", {plans: showPro ? t("Premium and Pro also include Heavy") : t("Premium also includes Heavy")}) },
    { question: t("How do transcription credits work?"), answer: t("A 60-second recording uses {light} credits with Light or {heavy} with Heavy.", {light: calculateTranscriptionCredits(60, "light"), heavy: calculateTranscriptionCredits(60, "super_heavy")}) },
    { question: t("How does billing work?"), answer: t("Subscriptions are charged when you subscribe. Premium is {premium} per {period}{pro}. Your subscription renews at the selected interval until cancelled.", {premium: formatLocalizedPrice("PREMIUM", billingInterval, displayCurrency), period: t(billingInterval === "yearly" ? "year" : "month"), pro: showPro ? t(" and Pro is {price} per {period}", {price: formatLocalizedPrice("PRO", billingInterval, displayCurrency), period: t(billingInterval === "yearly" ? "year" : "month")}) : ""}) },
    { question: t("What happens to unused credits?"), answer: t("Free credits do not roll over. Premium credits roll over up to {premium}{pro}.", {premium: PLAN_CATALOG.PREMIUM.rolloverCap, pro: showPro ? t(" and Pro credits up to {cap}", {cap: PLAN_CATALOG.PRO.rolloverCap}) : ""}) },
    { question: t("Can I cancel anytime?"), answer: t("Yes. Cancel in account settings to stop your next renewal. Access continues through the current billing period.") },
  ];
  const measurementContext = useCallback(() => pricingMeasurementContext({
    role: currentRole, plan: currentPlan, signedIn: Boolean(session),
    billingInterval, displayCurrency,
    userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
  }), [currentRole, currentPlan, session, billingInterval, displayCurrency]);
  const description =
    t("Monthly and yearly pricing for Note2Tabs. Compare Free, Premium, and Pro plans for guitar tab transcription and editing.");
  const pricingJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: t("Note2Tabs Pricing"),
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
          name: t("Home"),
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: t("Pricing"),
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
    buildPricingProductStructuredData(showPro, displayCurrency),
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
    if (!router.isReady || sessionStatus === "loading" || !offerVariantResolved || pricingViewTrackedRef.current) return;
    pricingViewTrackedRef.current = true;
    markPremiumPricingVisited();
    const funnel = getFunnelContext();
    sendEvent(ANALYTICS_EVENTS.pricingViewed, {
      path: "/pricing",
      ...measurementContext(),
      display_currency: readDisplayCurrencyCookie(document.cookie).toLowerCase(),
      ...premiumFunnelProperties(funnel),
      ...premiumOfferExperimentProperties(offerVariant),
    });
  }, [getFunnelContext, measurementContext, offerVariant, offerVariantResolved, router.isReady, sessionStatus]);

  const startCheckout = useCallback(async (plan: PaidSubscriptionPlan = "PREMIUM", resumed = false) => {
    if (checkoutBusy) return;
    const funnel = getFunnelContext();
    sendEvent(resumed ? ANALYTICS_EVENTS.pricingCheckoutResumed : ANALYTICS_EVENTS.pricingCtaClicked, {
      ...measurementContext(),
      cta: plan === "PRO" ? "pro_offer" : "premium_offer",
      plan: plan.toLowerCase(),
      billing_interval: billingInterval,
      display_currency: displayCurrency.toLowerCase(),
      signedIn: Boolean(session),
      path: "/pricing",
      ...premiumFunnelProperties(funnel),
      ...premiumOfferExperimentProperties(offerVariant),
    });
    if (!session) {
      const callbackUrl = `${premiumPricingHref(funnel)}&checkout=1&plan=${plan.toLowerCase()}&billing=${billingInterval}`;
      sendEvent(ANALYTICS_EVENTS.pricingAuthHandoff, {
        ...measurementContext(), plan: plan.toLowerCase(),
        ...premiumFunnelProperties(funnel), ...premiumOfferExperimentProperties(offerVariant),
      });
      await signIn(undefined, { callbackUrl });
      return;
    }
    if (hasStaffAccess || (hasPaidPremium && currentPlan === plan)) {
      await router.push(hasPaidPremium ? "/settings" : "/transcribe");
      return;
    }

    setCheckoutBusy(true);
    setCheckoutError(null);
    let failureStatus: number | undefined;
    try {
      const response = await fetch(hasPaidPremium ? "/api/stripe/change-plan" : "/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          source: funnel.source,
          reason: funnel.reason,
          funnelId: funnel.funnelId,
          offerVariant,
          plan: plan.toLowerCase(),
          billingInterval,
          displayCurrency: displayCurrency.toLowerCase(),
        }),
      });
      failureStatus = response.status;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || (!hasPaidPremium && !payload?.url)) {
        throw new Error(payload?.error || t("Checkout is temporarily unavailable. Please try again in a moment."));
      }
      sendEvent(ANALYTICS_EVENTS.checkoutRedirected, {
        ...measurementContext(),
        plan: `${plan.toLowerCase()}_${billingInterval}`,
        billing_interval: billingInterval,
        checkout_attempt_id: payload.checkoutAttemptId,
        checkout_session_id: payload.checkoutSessionId,
        checkout_currency: payload.checkoutCurrency,
        local_currency_eligible: payload.localCurrencyEligible,
        ...premiumFunnelProperties(funnel),
        ...premiumOfferExperimentProperties(offerVariant),
      });
      rememberCheckoutAttempt({
        checkoutSessionId: payload.checkoutSessionId,
        checkoutAttemptId: payload.checkoutAttemptId,
        funnelId: funnel.funnelId,
        plan: `${plan.toLowerCase()}_${billingInterval}`,
        billingInterval,
        checkoutCurrency: payload.checkoutCurrency,
        source: funnel.source,
        reason: funnel.reason,
      });
      if (payload.url) window.location.assign(payload.url);
      else await router.push("/settings?planChanged=1");
    } catch (error) {
      sendEvent(ANALYTICS_EVENTS.checkoutClientFailed, {
        ...measurementContext(),
        failure_category: failureStatus === undefined ? "network" : failureStatus >= 400 ? "http_error" : "invalid_response_or_navigation",
        http_status: failureStatus,
        plan: `${plan.toLowerCase()}_${billingInterval}`,
        billing_interval: billingInterval,
        ...premiumFunnelProperties(funnel),
        ...premiumOfferExperimentProperties(offerVariant),
      });
      setCheckoutError(
        error instanceof Error
          ? error.message
          : t("Checkout is temporarily unavailable. Please check your connection and try again.")
      );
      setCheckoutBusy(false);
    }
  }, [billingInterval, checkoutBusy, currentPlan, displayCurrency, getFunnelContext, hasPaidPremium, hasStaffAccess, measurementContext, offerVariant, router, session]);

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
    void startCheckout(router.query.plan === "pro" ? "PRO" : "PREMIUM", true);
  }, [billingInterval, getFunnelContext, offerVariantResolved, router.isReady, router.query.billing, router.query.checkout, router.query.plan, sessionStatus, startCheckout]);

  const planOrder = compact
    ? ["PREMIUM", "FREE", ...(showPro ? ["PRO"] : [])]
    : ["FREE", "PREMIUM", ...(showPro ? ["PRO"] : [])];
  return <>
    <SeoHead title={t("Pricing | Note2Tabs")} description={description} canonicalPath="/pricing" jsonLd={pricingJsonLd} />
    <main className="page page-pricing"><section className="pricing-page pricing-page--focused"><div className="container pricing-page__container">
      <header className="pricing-page__hero"><h1>{t("More music. More room to transcribe.")}</h1></header>{locale === "pt-BR" && <p className="locale-scope-note">{t("Transcription and pricing in Portuguese. The editor, help and legal documents are in English.")}</p>}
      <div className="pricing-billing-toggle" role="group" aria-label={t("Billing interval")}>
        {(["monthly", "yearly"] as const).map((interval) => <button key={interval} type="button" aria-pressed={billingInterval === interval} className={billingInterval === interval ? "is-active" : ""} onClick={() => {
          if (interval === billingInterval) return;
          sendEvent(ANALYTICS_EVENTS.pricingBillingSelected, {
            ...measurementContext(), billing_interval: interval,
            ...premiumFunnelProperties(getFunnelContext()), ...premiumOfferExperimentProperties(offerVariant),
          });
          setBillingInterval(interval);
        }} disabled={checkoutBusy}>{interval === "monthly" ? t("Monthly") : <>{t("Yearly")}<span className="pricing-billing-toggle__saving">{t("Save ")}{localizedAnnualSaving(showPro ? "PRO" : "PREMIUM", displayCurrency)}!</span></>}</button>)}
      </div>
      <section className={`pricing-page__plans${showPro ? " pricing-page__plans--three" : ""}`} aria-label={t("Note2Tabs plans")}>
        {planOrder.map((id) => {
          const plan = PLAN_CATALOG[id as keyof typeof PLAN_CATALOG];
          const paid = plan.id !== "FREE";
          const paidId = plan.id as PaidSubscriptionPlan;
          const included = hasStaffAccess && paid;
          const current = currentPlan === plan.id && paid;
          return <article key={plan.id} className={`pricing-plan pricing-plan--${plan.id.toLowerCase()}`}>
            {plan.id === "PREMIUM" && <div className="pricing-plan__badge">{t("Recommended")}</div>}
            <div className="pricing-plan__top"><h2>{t(plan.name)}</h2>
              <p>{plan.id === "FREE" ? t("Try short recordings.") : plan.id === "PREMIUM" ? t("For full songs.") : t("For frequent transcription.")}</p>
              <div className="pricing-plan__price"><strong>{paid ? formatLocalizedPrice(paidId, billingInterval, displayCurrency) : formatLocalizedAmount(0, displayCurrency)}</strong><span>/ {paid && billingInterval === "yearly" ? t("year") : t("month")}</span></div>
              {paid && billingInterval === "yearly" && <p className="pricing-plan__saving"><span className="pricing-plan__saving-amount">{t("Save ")}{localizedAnnualSaving(paidId, displayCurrency)}{t(" per year")}</span>{t(" · Billed annually")}</p>}
            </div>
            {!paid ? <Link href="/transcribe" className="pricing-plan__cta pricing-plan__cta--secondary" onClick={() => trackCtaClick("pricing_start_free", { surface: "pricing_page" })}>{t("Start free")}</Link>
              : included || current ? <Link href={included ? "/transcribe" : "/settings"} className="pricing-plan__cta pricing-plan__cta--secondary">{included ? t("{plan} access included", { plan: plan.name }) : t("Manage current plan")}</Link>
              : <button type="button" className={`pricing-plan__cta pricing-plan__cta--${plan.id === "PREMIUM" ? "primary" : "secondary"}`} onClick={() => void startCheckout(paidId)} disabled={checkoutBusy || sessionStatus === "loading"}>{checkoutBusy ? t("Opening checkout…") : hasPaidPremium ? t("Switch to {plan}", { plan: plan.name }) : plan.id === "PREMIUM" ? t("Get Premium") : t("Choose Pro")}</button>}
            <div className="pricing-plan__reassurance">
              {!paid ? t("No credit card required") : included || current ? t("Manage your subscription in your account.") : <>
                {formatLocalizedPrice(paidId, billingInterval, displayCurrency)}/{billingInterval === "yearly" ? t("year") : t("month")}{t(" billed today. Cancel anytime. ")}</>}
            </div>
            <div className="pricing-plan__divider" />
            <ul className="pricing-plan__features">
              <li><strong>{plan.monthlyCredits}</strong>{t(" credits every month")}</li>
              <li>{paid ? t("Full-length audio-file transcription") : t("Audio clips up to {seconds} seconds", { seconds: MAX_FREE_FILE_SNIPPET_SEC })}</li>
              <li>{paid ? t("Credits roll over, up to {cap}", { cap: plan.rolloverCap }) : t("No credit rollover")}</li>
              <li>{plan.id === "PRO" ? t("Everything in Premium + priority email support") : paid ? t("Light and Heavy models") : t("Light model, tab editor and practice tools")}</li>
            </ul>
          </article>;
        })}
      </section>
      <p className="pricing-credit-note">{t("A 60-second recording uses ")}{calculateTranscriptionCredits(60, "light")}{t(" credits with Light or ")}{calculateTranscriptionCredits(60, "super_heavy")}{t(" with Heavy. Credits refresh monthly.")}</p>
      <details className="pricing-comparison"><summary>{t("Compare all limits")}</summary><div className="pricing-comparison-scroll"><table><caption>{t("Recording and upload limits")}</caption><thead><tr><th scope="col">{t("Limit")}</th>{["FREE", "PREMIUM", ...(showPro ? ["PRO"] : [])].map((id) => <th scope="col" key={id}>{t(PLAN_CATALOG[id as keyof typeof PLAN_CATALOG].name)}</th>)}</tr></thead><tbody>
        <tr><th scope="row">{t("Upload size")}</th>{["FREE", "PREMIUM", ...(showPro ? ["PRO"] : [])].map((id) => <td key={id}>{PLAN_CATALOG[id as keyof typeof PLAN_CATALOG].maxUploadBytes / (1024 * 1024)} MB</td>)}</tr>
        <tr><th scope="row">{t("YouTube clip length")}</th><td>{t("Up to ")}{MAX_FREE_YOUTUBE_SNIPPET_SEC}{t(" seconds")}</td><td>{t("Within selected window")}</td>{showPro && <td>{t("Within selected window")}</td>}</tr>
        <tr><th scope="row">{t("YouTube selection window")}</th>{["FREE", "PREMIUM", ...(showPro ? ["PRO"] : [])].map((id) => <td key={id}>{t("First ")}{PLAN_CATALOG[id as keyof typeof PLAN_CATALOG].youtubePositionLimitSeconds / 60}{t(" minutes")}</td>)}</tr>
      </tbody></table></div><p>{t("Light handles guitar and multi-instrument recordings. Heavy is our most detailed model and requires Premium or Pro.")}</p></details>
      <section className="pricing-page__faq" aria-labelledby="pricing-faq-title"><div className="pricing-page__section-heading"><h2 id="pricing-faq-title">{t("Questions before you start?")}</h2></div><div className="pricing-page__faq-list">{pricingFaqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div></section>
      {checkoutError && <div className="error pricing-page__error" role="alert">{translatedError(checkoutError, locale)}</div>}
      <p className="pricing-status" role="status" aria-live="polite">{checkoutBusy ? t("Opening checkout…") : ""}</p>
    </div></section></main>
  </>;
}
