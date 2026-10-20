import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";
import {
  getOrCreatePremiumFunnelContext,
  premiumFunnelProperties,
  premiumPricingHref,
  type PremiumFunnelSource,
} from "../lib/premiumFunnel";
import { useEffect, useId, useRef, useState } from "react";
import Link from "./LocaleLink";
import { useLocale } from "../lib/i18n/react";
import { creditTopUpQuote } from "../lib/creditTopUpPricing";
import type { LimitContext } from "../lib/limitUpgrade";
export default function CreditShortfallDialog({
  context,
  preview = false,
  tracking,
  autoOpen = true,
}: {
  context: LimitContext;
  preview?: boolean;
  autoOpen?: boolean;
  tracking?: {
    source: PremiumFunnelSource;
    reason: string;
    surface: string;
    trigger: string;
  };
}) {
  const { t, locale, href } = useLocale(),
    id = useId(),
    dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false),
    seen = useRef<string | null>(null),
    viewed = useRef<string | null>(null),
    funnel = useRef<ReturnType<typeof getOrCreatePremiumFunnelContext> | null>(
      null,
    );
  const key = [
    context.plan,
    context.attempt,
    context.remaining,
    context.required,
  ].join(":");
  const properties = () => ({
    surface: tracking?.surface || "credit_shortfall_dialog",
    trigger: tracking?.trigger || "credits_exhausted",
    placement: "transcriber_limit",
    purchase_type: "credit_top_up",
    ...(funnel.current ? premiumFunnelProperties(funnel.current) : {}),
  });
  const [open, setOpen] = useState(autoOpen),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const amount = Math.max(
    15,
    Math.ceil(((context.required || 0) - (context.remaining || 0)) / 15) * 15,
  );
  const price = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "code",
  }).format(creditTopUpQuote(amount).amountCents / 100);
  useEffect(() => {
    setOpen(autoOpen);
  }, [context.attempt, context.remaining, context.required, autoOpen]);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open) dialog.current?.close();
  }, [open]);
  useEffect(() => {
    const node = dialog.current;
    if (!open || !node || preview) return;
    if (seen.current !== key) {
      seen.current = key;
      funnel.current = getOrCreatePremiumFunnelContext({
        source: tracking?.source || "low_credits",
        reason: "credits_exhausted",
      });
      [
        ANALYTICS_EVENTS.premiumPromptEligible,
        ANALYTICS_EVENTS.premiumPromptRendered,
        ANALYTICS_EVENTS.premiumPromptShown,
      ].forEach((event) => sendEvent(event, properties()));
    }
    let visible = false;
    const record = () => {
      if (
        visible &&
        document.visibilityState === "visible" &&
        viewed.current !== key
      ) {
        viewed.current = key;
        sendEvent(ANALYTICS_EVENTS.premiumPromptViewed, properties());
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
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
  }, [open, key, preview]);
  function dismiss() {
    if (inFlight.current) return;
    if (!preview)
      sendEvent(ANALYTICS_EVENTS.premiumPromptDismissed, properties());
    setOpen(false);
  }
  async function go(event: React.MouseEvent, target: string) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      if (!preview) await context.beforeCheckout?.();
      if (!preview)
        sendEvent(ANALYTICS_EVENTS.premiumPromptClicked, {
          ...properties(),
          cta: target.startsWith("/credits") ? "buy_credits" : "compare_plans",
        });
      window.location.assign(href(target));
    } catch {
      inFlight.current = false;
      setBusy(false);
      setError(true);
    }
  }
  return (
    <>
      {!open && (
        <button
          className="button-link"
          type="button"
          onClick={() => {
            seen.current = null;
            viewed.current = null;
            setOpen(true);
          }}
        >
          {t("Buy credits")}
        </button>
      )}
      <dialog
        ref={dialog}
        className="limit-upgrade-dialog credit-shortfall-dialog"
        data-limit-upgrade
        aria-labelledby={id}
        onCancel={(e) => {
          e.preventDefault();
          dismiss();
        }}
        onClose={() => setOpen(false)}
      >
        <h2 id={id}>
          {t(
            context.remaining === 0
              ? "You’ve used all your credits"
              : (context.required || 0) > (context.remaining || 0)
                ? "Not enough credits for this transcription"
                : "You’re running low on credits",
          )}
        </h2>
        <p className="limit-upgrade-description">
          {context.required && context.required > (context.remaining || 0)
            ? t(
                "This transcription needs {required} credits. You have {remaining} left.",
                {
                  required: context.required,
                  remaining: context.remaining || 0,
                },
              )
            : t("You have {remaining} credits left.", {
                remaining: context.remaining || 0,
              })}
        </p>
        <div className="credit-shortfall-offer">
          <strong>{t("{credits} credits", { credits: amount })}</strong>
          <span dir="ltr">{price}</span>
        </div>
        <p className="credit-shortfall-note">
          {t("One-time purchase. No subscription change.")}
        </p>
        <Link
          className="limit-upgrade-primary credit-shortfall-buy"
          href={`/credits?credits=${amount}`}
          aria-disabled={busy}
          onClick={(event) => void go(event, `/credits?credits=${amount}`)}
        >
          {t("Buy credits")}
        </Link>
        {error && (
          <p role="alert">
            {t("Could not save your selection. Please try again.")}
          </p>
        )}
        {context.plan !== "PRO" && (
          <Link
            className="limit-upgrade-compare"
            href={
              premiumPricingHref({
                source: tracking?.source || "low_credits",
                reason: "credits_exhausted",
              }) +
              `&plan=${context.plan === "PREMIUM" ? "pro" : "premium"}&resumeTranscription=1`
            }
            onClick={(event) =>
              void go(
                event,
                premiumPricingHref(
                  funnel.current || {
                    source: tracking?.source || "low_credits",
                    reason: "credits_exhausted",
                  },
                ) +
                  `&plan=${context.plan === "PREMIUM" ? "pro" : "premium"}&resumeTranscription=1`,
              )
            }
          >
            {t("Compare plans")}
          </Link>
        )}
        <button
          className="limit-upgrade-back"
          type="button"
          disabled={busy}
          onClick={dismiss}
        >
          {t("Back to transcriber")}
        </button>
      </dialog>
    </>
  );
}
