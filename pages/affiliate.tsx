import Head from "next/head";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type AffiliateData = {
  code: string;
  status: string;
  commissionPercent: number;
  commissionMonths: number;
  discountPercent: number;
  discountMonths: number;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  commissions: Array<{ id: string; amount: number; currency: string; status: string; availableAt: string }>;
};

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);

export default function AffiliatePage() {
  const { status } = useSession();
  const [affiliate, setAffiliate] = useState<AffiliateData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (status !== "authenticated") return;
    void fetch("/api/affiliate/me")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load affiliate account");
        setAffiliate(body.affiliate);
      })
      .catch((reason) => setError(reason.message));
  }, [status]);
  const onboard = async () => {
    setBusy(true);
    const response = await fetch("/api/affiliate/onboarding", { method: "POST" });
    const body = await response.json();
    if (response.ok && body.url) window.location.href = body.url;
    else { setError(body.error || "Could not open payout setup"); setBusy(false); }
  };
  const link = affiliate ? `https://www.note2tabs.com/?ref=${affiliate.code}` : "";

  return <>
    <Head><title>Affiliate dashboard | Note2Tabs</title><meta name="robots" content="noindex,nofollow" /></Head>
    <main className="page-shell account-page">
      <section className="content-card">
        <span className="eyebrow">Note2Tabs affiliates</span>
        <h1>Your affiliate dashboard</h1>
        {status === "unauthenticated" && <button className="button-primary" onClick={() => signIn(undefined, { callbackUrl: "/affiliate" })}>Sign in</button>}
        {error && <p role="alert">{error}</p>}
        {affiliate && <>
          <p>Earn {affiliate.commissionPercent}% from each referred customer’s first {affiliate.commissionMonths} paid months. They receive {affiliate.discountPercent}% off for {affiliate.discountMonths} months.</p>
          <label className="label" htmlFor="affiliate-link">Your referral link</label>
          <input id="affiliate-link" className="input" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          <p>Your customer-facing code is <strong>{affiliate.code}</strong>.</p>
          {!affiliate.payoutsEnabled && <button className="button-primary" onClick={onboard} disabled={busy}>{busy ? "Opening Stripe…" : affiliate.detailsSubmitted ? "Finish payout setup" : "Set up payouts with Stripe"}</button>}
          {affiliate.payoutsEnabled && <p role="status">Stripe payouts are ready.</p>}
          <h2>Commissions</h2>
          {affiliate.commissions.length === 0 ? <p>No paid referrals yet.</p> : <div className="table-scroll"><table><thead><tr><th>Amount</th><th>Status</th><th>Available</th></tr></thead><tbody>{affiliate.commissions.map((item) => <tr key={item.id}><td>{money(item.amount, item.currency)}</td><td>{item.status.toLowerCase()}</td><td>{new Date(item.availableAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
        </>}
      </section>
    </main>
  </>;
}
