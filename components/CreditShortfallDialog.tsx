import { useEffect, useId, useRef, useState } from "react";
import Link from "./LocaleLink";
import { useLocale } from "../lib/i18n/react";
import { creditTopUpQuote } from "../lib/creditTopUpPricing";
import type { LimitContext } from "../lib/limitUpgrade";
export default function CreditShortfallDialog({
  context,
  preview = false,
}: {
  context: LimitContext;
  preview?: boolean;
}) {
  const { t, locale, href } = useLocale(),
    id = useId(),
    dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(true),
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
    setOpen(true);
  }, [context.attempt, context.remaining, context.required]);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open) dialog.current?.close();
  }, [open]);
  async function go(event: React.MouseEvent, target: string) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (!preview) await context.beforeCheckout?.();
      window.location.assign(href(target));
    } catch {
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
          onClick={() => setOpen(true)}
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
          if (!busy) setOpen(false);
        }}
        onClose={() => setOpen(false)}
      >
        <h2 id={id}>
          {t(
            context.remaining === 0
              ? "You’ve used all your credits"
              : "Not enough credits for this transcription",
          )}
        </h2>
        <p className="limit-upgrade-description">
          {context.required
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
            href={`/pricing?plan=${context.plan === "PREMIUM" ? "pro" : "premium"}&resumeTranscription=1`}
            onClick={(event) =>
              void go(
                event,
                `/pricing?plan=${context.plan === "PREMIUM" ? "pro" : "premium"}&resumeTranscription=1`,
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
          onClick={() => setOpen(false)}
        >
          {t("Back to transcriber")}
        </button>
      </dialog>
    </>
  );
}
