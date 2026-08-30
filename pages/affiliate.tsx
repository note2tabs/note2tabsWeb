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

const money = (amount: number, currency = "usd") => new Intl.NumberFormat(undefined, {
  style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2,
}).format(amount / 100);

const CopyIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
const ArrowIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>;

export default function AffiliatePage() {
  const { status } = useSession();
  const [affiliate, setAffiliate] = useState<AffiliateData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

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
    await navigator.clipboard.writeText(value); setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
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
    <Head><title>Affiliate dashboard | Note2Tabs</title><meta name="robots" content="noindex,nofollow" /></Head>
    <main className="affiliatePage"><div className="affiliateShell">
      {status === "loading" && <section className="affiliateLoading" aria-live="polite"><span className="affiliateLoadingMark"/><p>Loading your affiliate dashboard…</p></section>}
      {status === "unauthenticated" && <section className="affiliateSignedOut">
        <span className="affiliateEyebrow">Note2Tabs affiliates</span><h1>Your referrals, commissions, and payouts in one place.</h1>
        <p>Sign in with the Note2Tabs account connected to your affiliate invitation.</p>
        <button className="affiliatePrimaryButton" onClick={() => signIn(undefined, { callbackUrl: "/affiliate" })}>Sign in to continue</button>
      </section>}
      {status === "authenticated" && error && !affiliate && <section className="affiliateError" role="alert">
        <h1>We couldn’t open your affiliate dashboard.</h1><p>{error}</p>
        <button className="affiliateSecondaryButton" onClick={() => window.location.reload()}>Try again</button>
      </section>}
      {affiliate && <>
        <header className="affiliateHero"><div><span className="affiliateEyebrow">Affiliate dashboard</span><h1>Share music. Earn together.</h1>
          <p>Introduce musicians to Note2Tabs and follow every commission from referral to payout.</p></div>
          <div className={`affiliateStatus ${affiliate.payoutsEnabled ? "affiliateStatusReady" : ""}`}><span className="affiliateStatusDot"/>{affiliate.payoutsEnabled ? "Payouts ready" : "Payout setup needed"}</div>
        </header>
        {!affiliate.payoutsEnabled && <section className="affiliateSetupCard">
          <div className="affiliateSetupIcon" aria-hidden="true">$</div><div className="affiliateSetupCopy"><span>One step left</span><h2>Connect Stripe to receive commissions</h2>
          <p>Stripe securely handles your identity, bank details, and payouts. Setup usually takes a few minutes.</p></div>
          <button className="affiliatePrimaryButton" onClick={onboard} disabled={busy}>{busy ? "Opening Stripe…" : affiliate.detailsSubmitted ? "Finish payout setup" : "Set up Stripe payouts"}<ArrowIcon/></button>
        </section>}
        {error && <div className="affiliateInlineError" role="alert">{error}</div>}
        <section className="affiliateStats" aria-label="Affiliate overview">
          <article><span>Total earned</span><strong>{money(totalEarned, currency)}</strong><small>Paid and pending</small></article>
          <article><span>Pending</span><strong>{money(affiliate.totals.pending, currency)}</strong><small>Released after the hold period</small></article>
          <article><span>Referred customers</span><strong>{affiliate.referralCount}</strong><small>Attributed accounts</small></article>
        </section>
        <div className="affiliateGrid">
          <section className="affiliateCard affiliateShareCard"><div className="affiliateCardHeading"><div><span className="affiliateSectionLabel">Your referral</span><h2>Share your link</h2></div>
            <span className="affiliateTermsBadge">{affiliate.discountPercent}% off for {affiliate.discountMonths} months</span></div>
            <p>Anyone who subscribes through your link receives the discount automatically.</p>
            <div className="affiliateCopyField"><span>{link}</span><button type="button" onClick={() => copy(link, "link")} aria-label="Copy referral link"><CopyIcon/>{copied === "link" ? "Copied" : "Copy"}</button></div>
            <div className="affiliateCodeRow"><div><span>Promotion code</span><strong>{affiliate.code}</strong></div><button type="button" onClick={() => copy(affiliate.code, "code")}><CopyIcon/>{copied === "code" ? "Copied" : "Copy code"}</button></div>
          </section>
          <aside className="affiliateCard affiliateTermsCard"><span className="affiliateSectionLabel">How earnings work</span><h2>{affiliate.commissionPercent}% commission</h2>
            <p>Earn from each referred customer’s first {affiliate.commissionMonths} paid subscription months.</p>
            <div className="affiliateTimeline" aria-label="Commission timeline">{Array.from({ length: affiliate.commissionMonths }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
            <small>Commissions are held briefly for refunds, then paid through Stripe.</small>
          </aside>
        </div>
        <section className="affiliateCard affiliateActivityCard"><div className="affiliateCardHeading"><div><span className="affiliateSectionLabel">Activity</span><h2>Commission history</h2></div>
          {affiliate.commissions.length > 0 && <span className="affiliateCount">{affiliate.commissions.length} total</span>}</div>
          {affiliate.commissions.length === 0 ? <div className="affiliateEmptyState"><div className="affiliateEmptyGraphic" aria-hidden="true"><span/><span/><span/></div>
            <h3>Your first referral will appear here</h3><p>Share your link with musicians who would benefit from editable tabs, transcription, and practice tools.</p></div> :
            <div className="affiliateTableWrap"><table className="affiliateTable"><thead><tr><th>Commission</th><th>Status</th><th>Created</th><th>Available</th></tr></thead><tbody>
              {affiliate.commissions.map((item) => <tr key={item.id}><td><strong>{money(item.amount, item.currency)}</strong></td><td><span className={`affiliateCommissionStatus affiliateCommissionStatus${item.status}`}>{item.status.toLowerCase()}</span></td><td>{new Date(item.createdAt).toLocaleDateString()}</td><td>{new Date(item.availableAt).toLocaleDateString()}</td></tr>)}
            </tbody></table></div>}
        </section>
      </>}
    </div></main>
  </>;
}
