import NoIndexHead from "../../components/NoIndexHead";
import { useMemo, useState } from "react";

type Commission = { id: string; amount: number; currency: string; status: string; availableAt: string; createdAt: string };
type AffiliateData = {
  code: string; status: string; commissionPercent: number; commissionMonths: number;
  discountPercent: number; discountMonths: number; payoutsEnabled: boolean;
  detailsSubmitted: boolean; referralCount: number; totals: { pending: number; paid: number };
  commissions: Commission[];
};

const money = (amount: number, currency = "usd") => new Intl.NumberFormat("en-US", {
  style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2,
}).format(amount / 100);

const CopyIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
const ArrowIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>;

const BASE_AFFILIATE: AffiliateData = {
  code: "GUITAR20", status: "active", commissionPercent: 20, commissionMonths: 6,
  discountPercent: 15, discountMonths: 3, payoutsEnabled: true, detailsSubmitted: true,
  referralCount: 14,
  totals: { pending: 4200, paid: 18900 },
  commissions: [
    { id: "1", amount: 1900, currency: "usd", status: "PAID", createdAt: "2026-09-01", availableAt: "2026-09-08" },
    { id: "2", amount: 1900, currency: "usd", status: "PENDING", createdAt: "2026-09-10", availableAt: "2026-09-17" },
    { id: "3", amount: 1900, currency: "usd", status: "REVERSED", createdAt: "2026-08-20", availableAt: "2026-08-27" },
  ],
};

export default function AffiliatePreviewDevPage() {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [stripeState, setStripeState] = useState<"ready" | "started" | "not_started">("ready");
  const affiliate: AffiliateData = {
    ...BASE_AFFILIATE,
    payoutsEnabled: stripeState === "ready",
    detailsSubmitted: stripeState === "started",
  };
  const link = `https://www.note2tabs.com/?ref=${affiliate.code}`;
  const currency = affiliate.commissions[0]?.currency || "usd";
  const totalEarned = useMemo(() => affiliate.totals.paid + affiliate.totals.pending, [affiliate.totals.paid, affiliate.totals.pending]);

  return (
    <>
      <NoIndexHead
        title="Affiliate Dashboard Preview | Note2Tabs"
        canonicalPath="/dev/affiliate-preview"
        description="Internal preview of the affiliate dashboard with mock data, for design review without needing to sign in as an affiliate."
      />
      <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", gap: 8, padding: "10px 20px", background: "#fff", borderBottom: "1px solid #e1e0da" }}>
        <strong style={{ fontSize: 13 }}>Stripe state:</strong>
        {(["ready", "started", "not_started"] as const).map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => setStripeState(state)}
            style={{
              padding: "4px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer",
              border: stripeState === state ? "1px solid #171917" : "1px solid #d8d7d1",
              background: stripeState === state ? "#171917" : "#fff",
              color: stripeState === state ? "#fff" : "#252623",
            }}
          >
            {state === "ready" ? "Payouts ready" : state === "started" ? "Stripe started, unfinished" : "Stripe not started"}
          </button>
        ))}
      </div>
      <main className="affiliatePage"><div className="affiliateShell">
        <header className="affiliateHero"><div><span className="affiliateEyebrow">Affiliate dashboard</span><h1>Share music. Earn together.</h1>
          <p>Introduce musicians to Note2Tabs and follow every commission from referral to payout.</p></div>
          <div className={`affiliateStatus ${affiliate.payoutsEnabled ? "affiliateStatusReady" : ""}`}><span className="affiliateStatusDot"/>{affiliate.payoutsEnabled ? "Payouts ready" : "Payout setup needed"}</div>
        </header>
        {!affiliate.payoutsEnabled && <section className="affiliateSetupCard">
          <div className="affiliateSetupIcon" aria-hidden="true">$</div><div className="affiliateSetupCopy"><span>One step left</span><h2>Connect Stripe to receive commissions</h2>
          <p>Stripe securely handles your identity, bank details, and payouts. Setup usually takes a few minutes.</p></div>
          <button className="affiliatePrimaryButton" type="button">{affiliate.detailsSubmitted ? "Finish payout setup" : "Set up Stripe payouts"}<ArrowIcon/></button>
        </section>}
        <section className="affiliateStats" aria-label="Affiliate overview">
          <article><span>Total earned</span><strong className="affiliateStatMoney">{money(totalEarned, currency)}</strong><small>Paid and pending</small></article>
          <article><span>Pending</span><strong className="affiliateStatMoney">{money(affiliate.totals.pending, currency)}</strong><small>Released after the hold period</small></article>
          <article><span>Referred customers</span><strong>{affiliate.referralCount}</strong><small>Attributed accounts</small></article>
        </section>
        <div className="affiliateGrid">
          <section className="affiliateCard affiliateShareCard"><div className="affiliateCardHeading"><div><span className="affiliateSectionLabel">Your referral</span><h2>Share your link</h2></div>
            <span className="affiliateTermsBadge">{affiliate.discountPercent}% off for {affiliate.discountMonths} months</span></div>
            <p>Anyone who subscribes through your link receives the discount automatically.</p>
            <div className="affiliateCopyField"><span>{link}</span><button type="button" onClick={() => setCopied("link")} aria-label="Copy referral link" aria-live="polite"><CopyIcon/>{copied === "link" ? "Copied" : "Copy"}</button></div>
            <div className="affiliateCodeRow"><div><span>Promotion code</span><strong>{affiliate.code}</strong></div><button type="button" onClick={() => setCopied("code")} aria-live="polite"><CopyIcon/>{copied === "code" ? "Copied" : "Copy code"}</button></div>
          </section>
          <aside className="affiliateCard affiliateTermsCard"><span className="affiliateSectionLabel">How earnings work</span><h2>{affiliate.commissionPercent}% commission</h2>
            <p>Earn from each referred customer’s first {affiliate.commissionMonths} paid subscription months.</p>
            <div className="affiliateTimeline" aria-label="Commission timeline">{Array.from({ length: affiliate.commissionMonths }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
            <small>Commissions are held briefly for refunds, then paid through Stripe.</small>
          </aside>
        </div>
        <section className="affiliateCard affiliateActivityCard"><div className="affiliateCardHeading"><div><span className="affiliateSectionLabel">Activity</span><h2>Commission history</h2></div>
          {affiliate.commissions.length > 0 && <span className="affiliateCount">{affiliate.commissions.length} total</span>}</div>
          <div className="affiliateTableWrap"><table className="affiliateTable"><thead><tr><th>Commission</th><th>Status</th><th>Created</th><th>Available</th></tr></thead><tbody>
            {affiliate.commissions.map((item) => <tr key={item.id}><td><strong className={item.status === "PAID" ? "affiliateStatMoney" : ""}>{money(item.amount, item.currency)}</strong></td><td><span className={`affiliateCommissionStatus affiliateCommissionStatus${item.status}`}>{item.status.toLowerCase()}</span></td><td>{new Date(item.createdAt).toLocaleDateString("en-US")}</td><td>{new Date(item.availableAt).toLocaleDateString("en-US")}</td></tr>)}
          </tbody></table></div>
        </section>
      </div></main>
    </>
  );
}
