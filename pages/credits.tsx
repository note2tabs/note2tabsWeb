import {creditPlacementReviewEnabled} from "../lib/creditPlacementPreview";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { localizedSignIn as signIn } from "../lib/i18n/auth";
import Link from "../components/LocaleLink";
import { useLocale } from "../lib/i18n/react";
import { creditTopUpQuote, MAX_CREDIT_PACKS } from "../lib/creditTopUpPricing";

export default function CreditsPage({creditPlacementReview=false}:{creditPlacementReview?:boolean}) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const { t, locale } = useLocale();
  const { status } = useSession();
  const [draft, setDraft] = useState("15"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false);
  const credits = Number(draft);
  let quote: ReturnType<typeof creditTopUpQuote> | undefined;
  try {
    quote = creditTopUpQuote(credits);
  } catch {}
  const price = quote
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        currencyDisplay: "code",
      }).format(quote.amountCents / 100)
    : "—";
  useEffect(() => {
    if (status !== "authenticated") {
      setBalance(null);
      return;
    }
    let active = true;
    void fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const remaining = data?.credits?.remaining;
        if (
          active &&
          data.source !== "dev" &&
          Number.isSafeInteger(remaining) &&
          remaining >= 0
        )
          setBalance(remaining);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [status, added]);
  useEffect(() => {
    const amount = Number(router.query.credits);
    try {
      creditTopUpQuote(amount);
      setDraft(String(amount));
      setCustom(![15, 30, 60].includes(amount));
    } catch {}
  }, [router.query.credits]);
  useEffect(() => {
    if (
      status !== "authenticated" ||
      typeof router.query.session_id !== "string"
    )
      return;
    let cancelled = false,
      attempts = 0,
      timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const r = await fetch(
          "/api/stripe/credit-top-up-status?session_id=" +
            encodeURIComponent(String(router.query.session_id)),
        );
        if (r.ok) {
          const result = await r.json();
          if (result.fulfilled && !cancelled) {
            setAdded(result.credits);
            return;
          }
        }
      } catch {}
      if (!cancelled && ++attempts < 24)
        timer = setTimeout(() => void check(), 5000);
    }
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, router.query.session_id]);
  async function buy() {
    if (inFlight.current || !quote) return;
    if(creditPlacementReview && process.env.NODE_ENV === "production"){setError(t("Preview only — no checkout opened."));return;}
    if (status !== "authenticated") {
      void signIn(undefined, {
        callbackUrl: `${window.location.origin}${router.asPath.split("?")[0]}?credits=${credits}`,
      });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/credit-top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits, locale }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error();
      window.location.assign(data.url);
    } catch {
      setError(t("Could not open checkout. Please try again."));
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <>
      <Head>
        <title>{`${t("Buy credits")} | Note2Tabs`}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="credit-top-up-page">
        <header className="credit-top-up-heading">
          <h1>{t("Buy credits")}</h1>
          <p>{t("One-time purchase. No subscription change.")}</p>
        </header>
        {added !== null ? (
          <p role="status">
            {t("{credits} credits added to your balance.", { credits: added })}
          </p>
        ) : router.query.payment === "processing" ? (
          <p role="status">
            {t("Payment processing. Credits appear after confirmation.")}
          </p>
        ) : router.query.payment === "cancelled" ? (
          <p role="status">{t("Checkout closed.")}</p>
        ) : null}
        <div className="credit-top-up-picker">
          {status === "authenticated" && balance !== null && (
            <div className="credit-top-up-balance">
              <span>{t("Current balance")}</span>
              <strong>{t("{credits} credits", { credits: balance })}</strong>
            </div>
          )}
          <fieldset className="credit-top-up-amounts" disabled={busy}>
            <legend>{t("Credits to add")}</legend>
            <div className="credit-top-up-presets">
              {[15, 30, 60].map((amount) => (
                <label key={amount} className="credit-top-up-option">
                  <input
                    type="radio"
                    name="credit-amount"
                    value={amount}
                    checked={!custom && credits === amount}
                    onChange={() => {
                      setCustom(false);
                      setDraft(String(amount));
                    }}
                  />
                  <span>
                    <strong>{amount}</strong>
                    <small>
                      {new Intl.NumberFormat(locale, {
                        style: "currency",
                        currency: "USD",
                        currencyDisplay: "code",
                      }).format(creditTopUpQuote(amount).amountCents / 100)}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <label className="credit-top-up-custom-choice">
              <input
                type="radio"
                name="credit-amount"
                checked={custom}
                onChange={() => setCustom(true)}
              />
              {t("Custom amount")}
            </label>
          </fieldset>
          {custom && (
            <div className="credit-top-up-custom">
              <label htmlFor="top-up-credits">{t("Credits")}</label>
              <div className="credit-top-up-stepper">
                <button
                  type="button"
                  aria-label={t("Fewer credits")}
                  disabled={credits <= 15 || !quote || busy}
                  onClick={() => setDraft(String(credits - 15))}
                >
                  −
                </button>
                <input
                  id="top-up-credits"
                  type="number"
                  min={15}
                  step={15}
                  max={MAX_CREDIT_PACKS * 15}
                  value={draft}
                  disabled={busy}
                  aria-describedby="credit-increments"
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={t("More credits")}
                  disabled={!quote || credits >= MAX_CREDIT_PACKS * 15 || busy}
                  onClick={() => setDraft(String(credits + 15))}
                >
                  +
                </button>
              </div>
              <small id="credit-increments">
                {t("Minimum 15 credits. Add in steps of 15.")}
              </small>
            </div>
          )}
          <div className="credit-top-up-total">
            <span>{t("Total")}</span>
            <strong dir="ltr" aria-live="polite">
              {price}
            </strong>
          </div>
          <button
            className="credit-top-up-buy"
            type="button"
            onClick={() => void buy()}
            disabled={!quote || busy || status === "loading"}
          >
            {busy
              ? t("Opening checkout…")
              : t("Buy {credits} credits — {price}", { credits, price })}
          </button>
          <p className="credit-top-up-carry">
            {t("Unused credits carry over. No expiry.")}
          </p>
          {(!quote || error) && (
            <p role="alert">
              {!quote
                ? t("Choose at least 15 credits, in increments of 15.")
                : error}
            </p>
          )}
        </div>
        <div className="credit-top-up-footer">
          <p>{t("Your plan’s models and upload limits stay the same.")}</p>
          <Link href="/pricing">{t("Compare plans")}</Link>
        </div>
      </main>
    </>
  );
}
export const getServerSideProps = async () =>
  process.env.CREDIT_TOPUPS_ENABLED === "true"
    ? { props: {creditPlacementReview:creditPlacementReviewEnabled()} }
    : { notFound: true };
