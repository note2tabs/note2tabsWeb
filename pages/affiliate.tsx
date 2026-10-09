import { translatedError } from "../lib/i18n/translate";
import { useLocale } from "../lib/i18n/react";
import Head from "next/head";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type Commission = { id: string; amount: number; currency: string; status: string; availableAt: string; createdAt: string };
type AffiliateData = {
  code: string; status: string; commissionPercent: number; commissionMonths: number;
  discountPercent: number; discountMonths: number; payoutsEnabled: boolean;
  detailsSubmitted: boolean; referralCount: number; totals: { pending: number; paid: number };
  commissions: Commission[];
};

const money = (amount: number, currency = "usd", locale = "en") => new Intl.NumberFormat(locale === "en" ? "en-US" : locale, {
  style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2,
}).format(amount / 100);

const CopyIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
const ArrowIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>;

export default function AffiliatePage() {
  const { t, locale } = useLocale();
  const { status } = useSession();
  const [affiliate, setAffiliate] = useState<AffiliateData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    void fetch("/api/affiliate/me").then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load your affiliate account");
      setAffiliate(body.affiliate);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load your affiliate account"));
  }, [status]);

  const link = affiliate ? `https://www.note2tabs.com/?ref=${affiliate.code}` : "";
  const currency = affiliate?.commissions[0]?.currency || "usd";
  const totalEarned = useMemo(() => affiliate ? affiliate.totals.paid + affiliate.totals.pending : 0, [affiliate]);
  const copy = async (value: string, kind: "link" | "code") => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopyError(true);
    }
  };
  const onboard = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/affiliate/onboarding", { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.url) throw new Error(body.error || "Could not open Stripe payout setup");
      window.location.href = body.url;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open Stripe payout setup"); setBusy(false);
    }
  };

  return <>
    <Head><title>{t("Affiliate dashboard | Note2Tabs")}</title><meta name="robots" content="noindex,nofollow" /></Head>
    <main className="affiliatePage"><div className="affiliateShell">
      {status === "loading" && <section className="affiliateLoading" aria-live="polite"><span className="affiliateLoadingMark"/><p>{t("Loading your affiliate dashboard…")}</p></section>}
      {status === "unauthenticated" && <section className="affiliateSignedOut">
        <span className="affiliateEyebrow">{t("Note2Tabs affiliates")}</span><h1>{t("Your referrals, commissions, and payouts in one place.")}</h1>
        <p>{t("Sign in with the Note2Tabs account connected to your affiliate invitation.")}</p>
        <button className="affiliatePrimaryButton" onClick={() => signIn(undefined, { callbackUrl: "/affiliate" })}>{t("Sign in to continue")}</button>
        <a className="affiliateSignedOutInfo" href="/affiliate-program">{t("Learn how the affiliate program works")}</a>
      </section>}
      {status === "authenticated" && error && !affiliate && <section className="affiliateError" role="alert">
        <h1>{t("We couldn’t open your affiliate dashboard.")}</h1><p>{translatedError(error, locale)}</p>
        <button className="affiliateSecondaryButton" onClick={() => window.location.reload()}>{t("Try again")}</button>
      </section>}
      {affiliate && <>
        <header className="affiliateHero"><div><span className="affiliateEyebrow">{t("Affiliate dashboard")}</span><h1>{t("Share music. Earn together.")}</h1>
          <p>{t("Introduce musicians to Note2Tabs and follow every commission from referral to payout.")}</p></div>
          <div className={`affiliateStatus ${affiliate.payoutsEnabled ? "affiliateStatusReady" : ""}`}><span className="affiliateStatusDot"/>{t(affiliate.payoutsEnabled ? "Payouts ready" : "Payout setup needed")}</div>
        </header>
        {!affiliate.payoutsEnabled && <section className="affiliateSetupCard">
          <div className="affiliateSetupIcon" aria-hidden="true">{t("$")}</div><div className="affiliateSetupCopy"><span>{t("One step left")}</span><h2>{t("Connect Stripe to receive commissions")}</h2>
          <p>{t("Stripe securely handles your identity, bank details, and payouts. Setup usually takes a few minutes.")}</p></div>
          <button className="affiliatePrimaryButton" onClick={onboard} disabled={busy}>{t(busy ? "Opening Stripe…" : affiliate.detailsSubmitted ? "Finish payout setup" : "Set up Stripe payouts")}<ArrowIcon/></button>
        </section>}
        {error && <div className="affiliateInlineError" role="alert">{translatedError(error, locale)}</div>}
        <section className="affiliateStats" aria-label={t("Affiliate overview")}>
          <article><span>{t("Total earned")}</span><strong className="affiliateStatMoney">{t(money(totalEarned, currency, locale))}</strong><small>{t("Paid and pending")}</small></article>
          <article><span>{t("Pending")}</span><strong className="affiliateStatMoney">{t(money(affiliate.totals.pending, currency, locale))}</strong><small>{t("Released after the hold period")}</small></article>
          <article><span>{t("Referred customers")}</span><strong>{affiliate.referralCount}</strong><small>{t("Attributed accounts")}</small></article>
        </section>
        <div className="affiliateGrid">
          <section className="affiliateCard affiliateShareCard"><div className="affiliateCardHeading"><div><span className="affiliateSectionLabel">{t("Your referral")}</span><h2>{t("Share your link")}</h2></div>
            <span className="affiliateTermsBadge">{affiliate.discountPercent}{t("% off for ")}{affiliate.discountMonths} {t(" months")}</span></div>
            <p>{t("Anyone who subscribes through your link receives the discount automatically.")}</p>
            <div className="affiliateCopyField"><span>{link}</span><button type="button" onClick={() => copy(link, "link")} aria-label={t("Copy referral link")} aria-live="polite"><CopyIcon/>{t(copied === "link" ? "Copied" : "Copy")}</button></div>
            <div className="affiliateCodeRow"><div><span>{t("Promotion code")}</span><strong>{affiliate.code}</strong></div><button type="button" onClick={() => copy(affiliate.code, "code")} aria-live="polite"><CopyIcon/>{t(copied === "code" ? "Copied" : "Copy code")}</button></div>
            {copyError && <p className="affiliateInlineError" role="alert">{t("Could not copy automatically. Select the link or code and copy it manually.")}</p>}
          </section>
          <aside className="affiliateCard affiliateTermsCard"><span className="affiliateSectionLabel">{t("How earnings work")}</span><h2>{affiliate.commissionPercent}{t("% commission")}</h2>
            <p>{t("Earn from each referred customer’s first ")}{affiliate.commissionMonths} {t(" paid subscription months.")}</p>
            <div className="affiliateTimeline" aria-label={t("Commission timeline")}>{Array.from({ length: affiliate.commissionMonths }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
            <small>{t("Commissions are held briefly for refunds, then paid through Stripe.")}</small>
          </aside>
        </div>
        <section className="affiliateCard affiliateActivityCard"><div className="affiliateCardHeading"><div><span className="affiliateSectionLabel">{t("Activity")}</span><h2>{t("Commission history")}</h2></div>
          {affiliate.commissions.length > 0 && <span className="affiliateCount">{affiliate.commissions.length} {t(" total")}</span>}</div>
          {affiliate.commissions.length === 0 ? <div className="affiliateEmptyState"><div className="affiliateEmptyGraphic" aria-hidden="true"><span/><span/><span/></div>
            <h3>{t("Your first referral will appear here")}</h3><p>{t("Share your link with musicians who would benefit from editable tabs, transcription, and practice tools.")}</p></div> :
            <div className="affiliateTableWrap"><table className="affiliateTable"><thead><tr><th>{t("Commission")}</th><th>{t("Status")}</th><th>{t("Created")}</th><th>{t("Available")}</th></tr></thead><tbody>
              {affiliate.commissions.map((item) => <tr key={item.id}><td><strong className={item.status === "PAID" ? "affiliateStatMoney" : ""}>{t(money(item.amount, item.currency, locale))}</strong></td><td><span className={`affiliateCommissionStatus affiliateCommissionStatus${item.status}`}>{t(item.status.toLowerCase())}</span></td><td>{t(new Date(item.createdAt).toLocaleDateString(locale === "en" ? "en-US" : locale))}</td><td>{t(new Date(item.availableAt).toLocaleDateString(locale === "en" ? "en-US" : locale))}</td></tr>)}
            </tbody></table></div>}
        </section>
      </>}
    </div></main>
  </>;
}
