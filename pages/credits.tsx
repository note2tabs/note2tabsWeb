import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "../components/LocaleLink";
import { useLocale } from "../lib/i18n/react";
import { creditTopUpQuote, MAX_CREDIT_PACKS } from "../lib/creditTopUpPricing";

export default function CreditsPage() {
  const router = useRouter();
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
    if (status !== "authenticated") {
      void signIn(undefined, { callbackUrl: window.location.href });
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
        <Link href="/pricing">{t("Compare plans")}</Link>
        <h1>{t("Buy more credits")}</h1>
        <p>{t("One-time purchase. No subscription change.")}</p>
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
          <label htmlFor="top-up-credits">{t("Credits")}</label>
          <div className="credit-top-up-stepper">
            <button
              type="button"
              aria-label={t("Fewer credits")}
              disabled={!quote || credits === 15 || busy}
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
          <strong className="credit-top-up-price" dir="ltr">
            {price}
          </strong>
          <p>
            {t(
              "Purchased credits stay in your balance each month. Your plan’s models and limits remain unchanged.",
            )}
          </p>
          <button
            className="button-primary"
            type="button"
            onClick={() => void buy()}
            disabled={!quote || busy || status === "loading"}
          >
            {busy
              ? t("Opening checkout…")
              : t("Buy {credits} credits", { credits })}
          </button>
          {(!quote || error) && (
            <p role="alert">
              {!quote
                ? t("Choose at least 15 credits, in increments of 15.")
                : error}
            </p>
          )}
        </div>
        <p>{t("Your credits appear after Stripe confirms payment.")}</p>
      </main>
    </>
  );
}
export const getServerSideProps = async () =>
  process.env.CREDIT_TOPUPS_ENABLED === "true"
    ? { props: {} }
    : { notFound: true };
