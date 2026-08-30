import type { GetServerSideProps } from "next";
import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { FormEvent, useMemo, useState } from "react";
import { prisma } from "../../lib/prisma";
import { hasFreshUserRole } from "../../lib/serverAuth";
import { authOptions } from "../api/auth/[...nextauth]";

type AffiliateRow = { id: string; code: string; status: string; email: string; referrals: number; pendingCommissions: number };
const CopyIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;

export default function AdminAffiliatesPage({ initialAffiliates }: { initialAffiliates: AffiliateRow[] }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [affiliates, setAffiliates] = useState(initialAffiliates);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const totals = useMemo(() => ({ active: affiliates.filter((item) => item.status === "ACTIVE").length, referrals: affiliates.reduce((sum, item) => sum + item.referrals, 0), pending: affiliates.reduce((sum, item) => sum + item.pendingCommissions, 0) }), [affiliates]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/affiliates/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      const body = await response.json();
      if (response.ok) {
        setMessage({ text: `Created affiliate ${body.affiliate.code}.`, tone: "success" });
        setAffiliates((rows) => [{ id: body.affiliate.id, code: body.affiliate.code, status: body.affiliate.status, email, referrals: 0, pendingCommissions: 0 }, ...rows]);
        setEmail(""); setCode("");
      } else setMessage({ text: body.error || "Could not create affiliate.", tone: "error" });
    } catch { setMessage({ text: "Could not reach Stripe. Please try again.", tone: "error" }); }
    finally { setBusy(false); }
  };

  const deactivate = async (affiliate: AffiliateRow) => {
    if (!window.confirm(`Deactivate ${affiliate.code}? Their link and coupon will stop working, while earned commissions remain payable.`)) return;
    setDeactivatingId(affiliate.id); setMessage(null);
    try {
      const response = await fetch("/api/admin/affiliates/deactivate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ affiliateId: affiliate.id }) });
      const body = await response.json();
      if (response.ok) {
        setAffiliates((rows) => rows.map((row) => row.id === affiliate.id ? { ...row, status: "DEACTIVATED" } : row));
        setMessage({ text: `${affiliate.code} was deactivated. Earned commissions will still be paid.`, tone: "success" });
      } else setMessage({ text: body.error || "Could not deactivate affiliate.", tone: "error" });
    } catch { setMessage({ text: "Could not update this affiliate. Please try again.", tone: "error" }); }
    finally { setDeactivatingId(null); }
  };

  const copyLink = async (affiliate: AffiliateRow) => {
    await navigator.clipboard.writeText(`${window.location.origin}/?ref=${affiliate.code}`);
    setCopiedId(affiliate.id); window.setTimeout(() => setCopiedId(null), 1800);
  };

  return <><Head><title>Affiliates | Note2Tabs Admin</title><meta name="robots" content="noindex,nofollow" /></Head><main className="adminAffiliatePage"><div className="adminAffiliateShell">
    <header className="adminAffiliateHero"><div><span className="affiliateEyebrow">Administration</span><h1>Affiliate program</h1><p>Invite trusted partners, track referrals, and manage who can represent Note2Tabs.</p></div><span className="adminAffiliateLive"><i />Stripe Connect active</span></header>
    <section className="adminAffiliateStats" aria-label="Affiliate program overview"><article><span>Active affiliates</span><strong>{totals.active}</strong><small>{affiliates.length - totals.active} deactivated</small></article><article><span>Total referrals</span><strong>{totals.referrals}</strong><small>Attributed accounts</small></article><article><span>Pending commissions</span><strong>{totals.pending}</strong><small>Payments awaiting payout</small></article></section>
    {message && <div className={`adminAffiliateNotice adminAffiliateNotice--${message.tone}`} role="status">{message.text}</div>}
    <div className="adminAffiliateLayout"><section className="adminAffiliateCard adminAffiliateInvite"><div className="adminAffiliateCardHeading"><div><span className="affiliateSectionLabel">New partnership</span><h2>Invite an affiliate</h2></div><span className="adminAffiliateStep">Stripe managed</span></div><p>The person needs an existing Note2Tabs account. Stripe will securely handle their identity and payout details.</p><form onSubmit={submit}><div className="adminAffiliateField"><label htmlFor="affiliate-email">Account email</label><input id="affiliate-email" type="email" required autoComplete="email" placeholder="artist@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="adminAffiliateField"><label htmlFor="affiliate-code">Referral and coupon code</label><input id="affiliate-code" required minLength={3} maxLength={32} placeholder="ARTIST20" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} /><small>3–32 characters. Letters, numbers, dashes, and underscores.</small></div><button className="affiliatePrimaryButton adminAffiliateSubmit" disabled={busy}>{busy ? "Creating affiliate…" : "Create affiliate"}<span aria-hidden="true">→</span></button></form></section>
    <aside className="adminAffiliateCard adminAffiliateTerms"><span className="affiliateSectionLabel">Program terms</span><h2>Simple by design</h2><dl><div><dt>Affiliate earns</dt><dd>20% for 6 months</dd></div><div><dt>Customer saves</dt><dd>10% for 3 months</dd></div><div><dt>Payouts</dt><dd>Handled through Stripe</dd></div></dl><p>Deactivation stops new referrals and disables the coupon. Previously earned commissions remain payable.</p></aside></div>
    <section className="adminAffiliateCard adminAffiliateDirectory"><div className="adminAffiliateDirectoryHeading"><div><span className="affiliateSectionLabel">Partners</span><h2>Current affiliates</h2></div><span className="affiliateCount">{affiliates.length} total</span></div>{affiliates.length === 0 ? <div className="adminAffiliateEmpty"><span>↗</span><h3>No affiliates yet</h3><p>Your invited partners will appear here.</p></div> : <div className="adminAffiliateTableWrap"><table className="adminAffiliateTable"><thead><tr><th>Affiliate</th><th>Status</th><th>Referrals</th><th>Pending</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{affiliates.map((affiliate) => <tr key={affiliate.id}><td><strong>{affiliate.code}</strong><span>{affiliate.email}</span></td><td><span className={`adminAffiliateStatus adminAffiliateStatus--${affiliate.status.toLowerCase()}`}><i />{affiliate.status === "ACTIVE" ? "Active" : "Deactivated"}</span></td><td>{affiliate.referrals}</td><td>{affiliate.pendingCommissions}</td><td><div className="adminAffiliateActions"><button type="button" className="adminAffiliateCopy" onClick={() => copyLink(affiliate)} disabled={affiliate.status !== "ACTIVE"}><CopyIcon />{copiedId === affiliate.id ? "Copied" : "Copy link"}</button>{affiliate.status === "ACTIVE" && <button type="button" className="adminAffiliateDeactivate" disabled={deactivatingId === affiliate.id} onClick={() => deactivate(affiliate)}>{deactivatingId === affiliate.id ? "Deactivating…" : "Deactivate"}</button>}</div></td></tr>)}</tbody></table></div>}</section>
  </div></main></>;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session?.user?.id) return { redirect: { destination: "/auth/login?next=/admin/affiliates", permanent: false } };
  if (!(await hasFreshUserRole(session, new Set(["ADMIN"])))) return { notFound: true };
  const affiliates = await prisma.affiliate.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, code: true, status: true, owner: { select: { email: true } }, _count: { select: { attributions: true } }, commissions: { where: { status: "PENDING" }, select: { id: true } } } });
  return { props: { initialAffiliates: affiliates.map((affiliate) => ({ id: affiliate.id, code: affiliate.code, status: affiliate.status, email: affiliate.owner.email, referrals: affiliate._count.attributions, pendingCommissions: affiliate.commissions.length })) } };
};
