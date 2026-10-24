import { limitPopupTracking } from "../lib/limitPopupTracking";
import { useCreditUpgradeQuote } from "../lib/useCreditUpgradeQuote";
import CreditUpgradeSummary, { upgradeMoney } from "./CreditUpgradeSummary";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { localizedSignIn } from "../lib/i18n/auth";
import { useLocale } from "../lib/i18n/react";
import {
  useDisplayCurrency,
  usePricingMarket,
} from "../lib/useDisplayCurrency";
import { formatLocalizedPrice } from "../lib/localizedPricing";
import { limitUpgradePlan, type LimitContext } from "../lib/limitUpgrade";
import {
  getOrCreatePremiumFunnelContext,
  premiumFunnelProperties,
  premiumPricingHref,
  type PremiumFunnelSource,
} from "../lib/premiumFunnel";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";
import { rememberCheckoutAttempt } from "../lib/checkoutTracking";
import { PLAN_CATALOG } from "../lib/subscriptionPlans";
import Link from "./LocaleLink";

type Props = {
  context: LimitContext;
  preview?: boolean;
  previewControls?: ReactNode;
  tracking?: {
    source: PremiumFunnelSource;
    reason: string;
    surface: string;
    trigger: string;
  };
  resetMessage?: string;
};
export default function LimitUpgradePrompt({
  context,
  tracking,
  resetMessage,
  preview = false,
  previewControls,
}: Props) {
  const { t, locale, href: localizedHref } = useLocale(),
    { data: session, status } = useSession();
  const currency = useDisplayCurrency(),
    market = usePricingMarket();
  const reason = tracking?.reason || "credits_low",
    plan = limitUpgradePlan(reason, context);
  const upgrade = useCreditUpgradeQuote(context.plan === "PREMIUM" && plan === "PRO", context.remaining);
  const dialog = useRef<HTMLDialogElement>(null),
    id = useId(),
    busyRef = useRef(false),
    operation = useRef(0),
    shown = useRef<string | null>(null),
    viewed = useRef<string | null>(null);
  const [open, setOpen] = useState(
      reason !== "credits_low" || context.remaining === 0,
    ),
    [busy, setBusy] = useState(false),
    [preserving, setPreserving] = useState(false),
    [recovery, setRecovery] = useState<"checkout" | "compare" | null>(null),
    [error, setError] = useState("");
  const key = [
    reason,
    context.plan,
    context.fileBytes,
    context.clipSeconds,
    context.remaining,
    context.required,
    context.attempt,
  ].join(":");
  const funnel = useRef<ReturnType<
    typeof getOrCreatePremiumFunnelContext
  > | null>(null);
  const props = () => ({
    surface: tracking?.surface || "limit_dialog",
    trigger: tracking?.trigger || reason,
    placement: "transcriber_limit",
    ...limitPopupTracking(reason, context),
    locale,
    target_plan: plan?.toLowerCase(),
    ...(funnel.current ? premiumFunnelProperties(funnel.current) : {}),
  });
  useEffect(() => {
    operation.current++;
    busyRef.current = false;
    setBusy(false);
    setPreserving(false);
    setRecovery(null);
    setOpen(reason !== "credits_low" || context.remaining === 0);
    setError("");
  }, [key]);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && plan) {
      if (!node.open) node.showModal();
      if (!preview && shown.current !== key) {
        shown.current = key;
        funnel.current = getOrCreatePremiumFunnelContext({
          source: tracking?.source || "premium_prompt",
          reason,
        });
        const properties = props();
        [
          ANALYTICS_EVENTS.premiumPromptEligible,
          ANALYTICS_EVENTS.premiumPromptRendered,
          ANALYTICS_EVENTS.premiumPromptShown,
        ].forEach((event) => sendEvent(event, properties));
      }
    } else node.close();
  }, [open, key, plan]);
  useEffect(() => {
    const node = dialog.current;
    if (!node || !open || !plan || preview) return;
    let inView = false;
    const record = () => {
      if (
        !inView ||
        document.visibilityState !== "visible" ||
        viewed.current === key
      )
        return;
      viewed.current = key;
      sendEvent(ANALYTICS_EVENTS.premiumPromptViewed, props());
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        record();
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", record);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", record);
    };
  }, [open, key, plan, preview]);
  useEffect(() => () => { operation.current++; }, []);
  function dismiss(method: "escape" | "back_to_transcriber" = "back_to_transcriber") {
    if (busy && !preserving) return;
    operation.current++;
    busyRef.current = false;
    setBusy(false);
    setPreserving(false);
    setRecovery(null);
    if (!preview) sendEvent(ANALYTICS_EVENTS.premiumPromptDismissed, { ...props(), dismiss_method: method });
    setOpen(false);
  }
  const isFile = reason.includes("file_size"),
    isYoutube = reason === "youtube_duration_limit",
    isDuration = reason === "file_duration_limit",
    isHeavy = reason === "heavy_model_locked";
  const isCredits = !isFile && !isYoutube && !isDuration && !isHeavy;
  const title = isFile
    ? t("Your file is too large")
    : isYoutube
      ? t("Your YouTube section is too long")
      : isDuration
        ? t("Your audio section is too long")
        : isHeavy
          ? t("Use the Heavy model")
          : context.remaining === 0
            ? t("You’ve used all your credits")
            : context.required && context.required > (context.remaining || 0)
              ? t("Not enough credits for this transcription")
              : t("You’re running low on credits");
  const description = isFile
    ? t("Your file is {size} MB. Your plan’s upload limit is {limit} MB.", {
        size: Math.ceil((context.fileBytes || 0) / 1024 / 1024),
        limit: PLAN_CATALOG[context.plan].maxUploadBytes / 1024 / 1024,
      })
    : isYoutube || isDuration
      ? t(
          "You selected {seconds} seconds. Your plan’s limit is {limit} seconds.",
          {
            seconds: context.clipSeconds || 0,
            limit: isYoutube
              ? context.plan === "FREE"
                ? 30
                : PLAN_CATALOG[context.plan].youtubePositionLimitSeconds
              : 60,
          },
        )
      : isHeavy
        ? t(
            "The Heavy model is available with Premium or Pro for our highest transcription accuracy.",
          )
        : context.required
          ? t(
              "This transcription needs {required} credits. You have {remaining} left.",
              { required: context.required, remaining: context.remaining || 0 },
            )
          : t("You have {remaining} credits left.", {
              remaining: context.remaining || 0,
            });
  const definition = plan ? PLAN_CATALOG[plan] : null;
  const price = upgrade.quote ? upgradeMoney(upgrade.quote, upgrade.quote.dueNow, locale) : plan
    ? formatLocalizedPrice(plan, "monthly", currency, locale, market)
    : "";
  const compare =
    premiumPricingHref({
      source: tracking?.source || "premium_prompt",
      reason,
    }) + (plan ? `&plan=${plan.toLowerCase()}&resumeTranscription=1` : "");
  async function preserveSelection(action: "checkout" | "compare", attempt: number, skip: boolean) {
    if (skip || !context.beforeCheckout) return true;
    setPreserving(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => context.beforeCheckout!()),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("selection_save_timeout")), 3000);
        }),
      ]);
      return operation.current === attempt;
    } catch (failure) {
      if (operation.current !== attempt) return false;
      sendEvent(ANALYTICS_EVENTS.premiumSelectionPreservationFailed, {
        ...props(), action,
        failure_category: failure instanceof Error && failure.message === "selection_save_timeout" ? "timeout" : "storage_error",
      });
      setRecovery(action);
      setError(t("Your selection couldn’t be saved. Continue without saving, or go back to keep it here."));
      setBusy(false);
      busyRef.current = false;
      return false;
    } finally {
      if (timer) clearTimeout(timer);
      if (operation.current === attempt) setPreserving(false);
    }
  }
  async function comparePlans(skipSave = false) {
    if (preview || busyRef.current) return;
    busyRef.current = true;
    const attempt = ++operation.current;
    setBusy(true);
    setRecovery(null);
    setError("");
    if (!skipSave) sendEvent(ANALYTICS_EVENTS.premiumPromptClicked, {...props(), cta: "compare_plans"});
    else sendEvent(ANALYTICS_EVENTS.premiumSelectionPreservationSkipped, {...props(), action: "compare"});
    if (!await preserveSelection("compare", attempt, skipSave)) return;
    if (operation.current !== attempt) return;
    window.location.assign(localizedHref(skipSave ? compare.replace("&resumeTranscription=1", "") : compare));
  }
  async function checkout(skipSave = false) {
    if (preview) {
      setError(t("Preview only — no checkout opened."));
      return;
    }
    if (busyRef.current || !plan || status === "loading") return;
    busyRef.current = true;
    const attempt = ++operation.current;
    setBusy(true);
    setRecovery(null);
    setError("");
    const current =
      funnel.current ||
      getOrCreatePremiumFunnelContext({
        source: tracking?.source || "premium_prompt",
        reason,
      });
    funnel.current = current;
    if (skipSave) sendEvent(ANALYTICS_EVENTS.premiumSelectionPreservationSkipped, {...props(), action: "checkout"});
    else sendEvent(ANALYTICS_EVENTS.premiumPromptClicked, { ...props(), cta: context.plan === "FREE" ? "start_checkout" : upgrade.quote ? "confirm_pro_upgrade" : "review_upgrade" });
    try {
      if (!await preserveSelection("checkout", attempt, skipSave)) return;
      if (operation.current !== attempt) return;
      if (context.plan === "PREMIUM" && upgrade.quote) {
        const response = await fetch("/api/stripe/change-plan", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "pro", billingInterval: "monthly", action: "confirm", quoteId: upgrade.quote.id, locale }),
        });
        const result = await response.json();
        if (operation.current !== attempt) return;
        if (!response.ok) { upgrade.refresh(); throw Error(); }
        window.location.assign(result.url || localizedHref(skipSave ? "/transcribe" : "/transcribe?resumeTranscription=1"));
        return;
      }
      // Existing subscribers review the upgrade on pricing; never create a second subscription.
      if (context.plan !== "FREE") {
        window.location.assign(localizedHref(skipSave ? compare.replace("&resumeTranscription=1", "") : compare));
        return;
      }
      if (!session) {
        await localizedSignIn(undefined, {
          callbackUrl: localizedHref(`${skipSave ? compare.replace("&resumeTranscription=1", "") : compare}&checkout=1&billing=monthly`),
        });
        return;
      }
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          source: current.source,
          reason: current.reason,
          funnelId: current.funnelId,
          plan: plan.toLowerCase(),
          billingInterval: "monthly",
          displayCurrency: currency.toLowerCase(),
          returnTo: skipSave ? "/transcribe" : "/transcribe?resumeTranscription=1",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (operation.current !== attempt) return;
      if (!response.ok || !data.url) throw Error();
      rememberCheckoutAttempt({
        checkoutSessionId: data.checkoutSessionId,
        checkoutAttemptId: data.checkoutAttemptId,
        funnelId: current.funnelId,
        plan: `${plan.toLowerCase()}_monthly`,
        billingInterval: "monthly",
        checkoutCurrency: data.checkoutCurrency,
        source: current.source,
        reason: current.reason,
      });
      sendEvent(ANALYTICS_EVENTS.checkoutRedirected, {
        ...props(),
        plan: `${plan.toLowerCase()}_monthly`,
        checkout_attempt_id: data.checkoutAttemptId,
        checkout_session_id: data.checkoutSessionId,
        checkout_currency: data.checkoutCurrency,
      });
      window.location.assign(data.url);
    } catch {
      if (operation.current !== attempt) return;
      sendEvent(ANALYTICS_EVENTS.checkoutClientFailed, props());
      setError(
        t("Checkout is temporarily unavailable. Please try again in a moment."),
      );
      setBusy(false);
      busyRef.current = false;
    }
  }
  if (!plan || !definition)
    return (
      <div className="notice">
        {context.plan === "PRO" && isCredits && context.resetLabel
          ? t("Your credits reset {date}", { date: context.resetLabel })
          : resetMessage ||
            t(
              "This selection exceeds the available plans. Choose a smaller file or a shorter section.",
            )}
      </div>
    );
  return (
    <>
      <dialog
        ref={dialog}
        className="limit-upgrade-dialog"
        data-limit-upgrade
        aria-labelledby={id}
        aria-describedby={`${id}-description`}
        onCancel={(event) => {
          event.preventDefault();
          dismiss("escape");
        }}
        onClose={() => setOpen(false)}
      >
        {previewControls}
        <h2 id={id}>{title}</h2>
        <p id={`${id}-description`} className="limit-upgrade-description">
          {description}
        </p>
        <div className="limit-upgrade-offer">
          <div className="limit-upgrade-price">
            <bdi>{price}</bdi>
            <small>{upgrade.quote ? t("today") : t(" / month")}</small>
          </div>
          {upgrade.quote ? <CreditUpgradeSummary quote={upgrade.quote} /> : <p>{t("Billed monthly · Cancel anytime")}</p>}
        </div>
        <ul>
          <li>
            {t("{count} credits every month", {
              count: definition.monthlyCredits,
            })}
          </li>
          <li>{t("Access to our most accurate models")}</li>
          <li>
            {t("YouTube length limit: {minutes} minutes", {
              minutes: definition.youtubePositionLimitSeconds / 60,
            })}
          </li>
          <li>
            {t("Uploads up to {size} MB", {
              size: definition.maxUploadBytes / 1024 / 1024,
            })}
          </li>
        </ul>
        <button
          type="button"
          className="limit-upgrade-primary"
          disabled={busy || status === "loading"}
          onClick={() => void (recovery === "compare" ? comparePlans(true) : checkout(Boolean(recovery)))}
        >
          {busy
            ? t("Opening checkout…")
            : recovery ? t("Continue without saving")
            : upgrade.quote ? t("Upgrade to Pro — {price}", { price }) : t("Get {plan} — {price}/month", { plan: definition.name, price })}
        </button>
        {error && <p role="alert">{error}</p>}
        <Link
          className="limit-upgrade-compare"
          aria-disabled={busy}
          href={compare}
          onClick={(event) => {
            if (preview) return;
            event.preventDefault();
            void comparePlans();
          }}
        >
          {t("Compare plans")}
        </Link>
        <button
          type="button"
          className="limit-upgrade-back"
          disabled={busy && !preserving}
          onClick={() => dismiss("back_to_transcriber")}
        >
          {t("Back to transcriber")}
        </button>
      </dialog>
    </>
  );
}
