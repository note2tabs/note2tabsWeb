import type { GetServerSideProps } from "next";
import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { FormEvent, useMemo, useState } from "react";
import { prisma } from "../../lib/prisma";
import { hasFreshUserRole } from "../../lib/serverAuth";
import { STANDALONE_PROMOTION_METADATA_KEY } from "../../lib/standalonePromotion";
import { stripeClient } from "../../lib/stripe";
import { authOptions } from "../api/auth/[...nextauth]";

type AffiliateRow = { id: string; code: string; status: string; email: string; referrals: number; pendingCommissions: number };
type PromotionRow = { id: string; code: string; active: boolean; percentOff: number; durationMonths: number; expiresAt: number | null };
type Notice = { text: string; tone: "success" | "error" };

const CopyIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
const formatEndDate = (epoch: number | null) => epoch ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(epoch * 1000)) : "No end date";

export default function AdminAffiliatesPage({ initialAffiliates, initialPromotions }: { initialAffiliates: AffiliateRow[]; initialPromotions: PromotionRow[] }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [affiliates, setAffiliates] = useState(initialAffiliates);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [promotionCode, setPromotionCode] = useState("");
  const [percentOff, setPercentOff] = useState("10");
  const [durationMonths, setDurationMonths] = useState("3");
  const [expiresOn, setExpiresOn] = useState("");
  const [promotionBusy, setPromotionBusy] = useState(false);
  const [promotions, setPromotions] = useState(initialPromotions);
  const [deactivatingPromotionId, setDeactivatingPromotionId] = useState<string | null>(null);
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

  const createPromotion = async (event: FormEvent) => {
    event.preventDefault(); setPromotionBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/affiliates/promotions/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promotionCode, percentOff: Number(percentOff), durationMonths: Number(durationMonths), expiresOn }) });
      const body = await response.json();
      if (response.ok) {
        setPromotions((rows) => [body.promotion, ...rows]); setPromotionCode(""); setExpiresOn("");
        setMessage({ text: `Created general discount code ${body.promotion.code}.`, tone: "success" });
      } else setMessage({ text: body.error || "Could not create the discount code.", tone: "error" });
    } catch { setMessage({ text: "Could not reach Stripe. Please try again.", tone: "error" }); }
    finally { setPromotionBusy(false); }
  };

  const deactivate = async (affiliate: AffiliateRow) => {
    if (!window.confirm(`Deactivate ${affiliate.code}? Their link and coupon will stop working, while earned commissions remain payable.`)) return;
    setDeactivatingId(affiliate.id); setMessage(null);
    try {
      const response = await fetch("/api/admin/affiliates/deactivate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ affiliateId: affiliate.id }) });
      const body = await response.json();
      if (response.ok) { setAffiliates((rows) => rows.map((row) => row.id === affiliate.id ? { ...row, status: "DEACTIVATED" } : row)); setMessage({ text: `${affiliate.code} was deactivated. Earned commissions will still be paid.`, tone: "success" }); }
      else setMessage({ text: body.error || "Could not deactivate affiliate.", tone: "error" });
    } catch { setMessage({ text: "Could not update this affiliate. Please try again.", tone: "error" }); }
    finally { setDeactivatingId(null); }
  };

  const deactivatePromotion = async (promotion: PromotionRow) => {
    if (!window.confirm(`Deactivate ${promotion.code}? It will stop working immediately.`)) return;
    setDeactivatingPromotionId(promotion.id); setMessage(null);
    try {
      const response = await fetch("/api/admin/affiliates/promotions/deactivate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ promotionId: promotion.id }) });
      const body = await response.json();
      if (response.ok) { setPromotions((rows) => rows.map((row) => row.id === promotion.id ? { ...row, active: false } : row)); setMessage({ text: `${promotion.code} was deactivated.`, tone: "success" }); }
      else setMessage({ text: body.error || "Could not deactivate the discount code.", tone: "error" });
    } catch { setMessage({ text: "Could not update this discount code. Please try again.", tone: "error" }); }
    finally { setDeactivatingPromotionId(null); }
  };

  const copyLink = async (affiliate: AffiliateRow) => {
    setMessage(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?ref=${affiliate.code}`);
      setCopiedId(affiliate.id); window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setMessage({ text: "Could not copy the referral link. Please copy it from the affiliate dashboard.", tone: "error" });
    }
  };

  return <><Head><title>Affiliates | Note2Tabs Admin</title><meta name="robots" content="noindex,nofollow" /></Head><main className="adminAffiliatePage"><div className="adminAffiliateShell">
    <header className="adminAffiliateHero"><div><span className="affiliateEyebrow">Administration</span><h1>Affiliates & discounts</h1><p>Invite trusted partners and create general checkout discounts without affiliate attribution.</p></div><span className="adminAffiliateLive"><i />Stripe Connect active</span></header>
    <section className="adminAffiliateStats" aria-label="Affiliate program overview"><article><span>Active affiliates</span><strong>{totals.active}</strong><small>{affiliates.length - totals.active} deactivated</small></article><article><span>Total referrals</span><strong>{totals.referrals}</strong><small>Attributed accounts</small></article><article><span>Pending commissions</span><strong>{totals.pending}</strong><small>Payments awaiting payout</small></article></section>
    {message && <div className={`adminAffiliateNotice adminAffiliateNotice--${message.tone}`} role="status">{message.text}</div>}
    <div className="adminAffiliateLayout"><section className="adminAffiliateCard adminAffiliateInvite"><div className="adminAffiliateCardHeading"><div><span className="affiliateSectionLabel">New partnership</span><h2>Invite an affiliate</h2></div><span className="adminAffiliateStep">Stripe managed</span></div><p>The person needs an existing Note2Tabs account. Stripe will securely handle their identity and payout details.</p><form onSubmit={submit}><div className="adminAffiliateField"><label htmlFor="affiliate-email">Account email</label><input id="affiliate-email" type="email" required autoComplete="email" placeholder="artist@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="adminAffiliateField"><label htmlFor="affiliate-code">Referral and coupon code</label><input id="affiliate-code" required minLength={3} maxLength={32} placeholder="ARTIST20" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} /><small>3–32 characters. Letters, numbers, dashes, and underscores.</small></div><button className="affiliatePrimaryButton adminAffiliateSubmit" disabled={busy}>{busy ? "Creating affiliate…" : "Create affiliate"}<span aria-hidden="true">→</span></button></form></section>
    <aside className="adminAffiliateCard adminAffiliateTerms"><span className="affiliateSectionLabel">Program terms</span><h2>Simple by design</h2><dl><div><dt>Affiliate earns</dt><dd>20% for 6 months</dd></div><div><dt>Customer saves</dt><dd>10% for 3 months</dd></div><div><dt>Payouts</dt><dd>Handled through Stripe</dd></div></dl><p>Deactivation stops new referrals and disables the coupon. Previously earned commissions remain payable.</p></aside></div>
    <section className="adminAffiliateCard adminAffiliatePromotion"><div className="adminAffiliateCardHeading"><div><span className="affiliateSectionLabel">General promotions</span><h2>Create a discount code</h2></div><span className="adminAffiliateStep">No commission</span></div><p>This code works at checkout but is not connected to an affiliate, referral, or commission. The end date is optional.</p><form onSubmit={createPromotion}>
      <div className="adminAffiliateField"><label htmlFor="promotion-code">Code</label><input id="promotion-code" required minLength={3} maxLength={32} placeholder="SUMMER20" value={promotionCode} onChange={(event) => setPromotionCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} /></div>
      <div className="adminAffiliateField"><label htmlFor="promotion-percent">Discount</label><div className="adminAffiliateInputSuffix"><input id="promotion-percent" type="number" min="1" max="100" step="1" required value={percentOff} onChange={(event) => setPercentOff(event.target.value)} /><span>%</span></div></div>
      <div className="adminAffiliateField"><label htmlFor="promotion-months">Discount duration</label><div className="adminAffiliateInputSuffix"><input id="promotion-months" type="number" min="1" max="24" step="1" required value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} /><span>months</span></div></div>
      <div className="adminAffiliateField"><label htmlFor="promotion-end">End date <em>Optional</em></label><input id="promotion-end" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></div>
      <button className="affiliatePrimaryButton adminAffiliateSubmit" disabled={promotionBusy}>{promotionBusy ? "Creating code…" : "Create discount code"}<span aria-hidden="true">→</span></button>
    </form></section>
    <section className="adminAffiliateCard adminAffiliateDirectory adminAffiliatePromotions"><div className="adminAffiliateDirectoryHeading"><div><span className="affiliateSectionLabel">Checkout discounts</span><h2>General discount codes</h2></div><span className="affiliateCount">{promotions.length} total</span></div>{promotions.length === 0 ? <div className="adminAffiliateEmpty"><span>%</span><h3>No general codes yet</h3><p>Codes created above will appear here.</p></div> : <div className="adminAffiliateTableWrap"><table className="adminAffiliateTable"><thead><tr><th>Code</th><th>Offer</th><th>Ends</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{promotions.map((promotion) => <tr key={promotion.id}><td><strong>{promotion.code}</strong><span>No affiliate attribution</span></td><td>{promotion.percentOff}% for {promotion.durationMonths} {promotion.durationMonths === 1 ? "month" : "months"}</td><td>{formatEndDate(promotion.expiresAt)}</td><td><span className={`adminAffiliateStatus adminAffiliateStatus--${promotion.active ? "active" : "deactivated"}`}><i />{promotion.active ? "Active" : "Inactive"}</span></td><td><div className="adminAffiliateActions">{promotion.active && <button type="button" className="adminAffiliateDeactivate" disabled={deactivatingPromotionId === promotion.id} onClick={() => deactivatePromotion(promotion)}>{deactivatingPromotionId === promotion.id ? "Deactivating…" : "Deactivate"}</button>}</div></td></tr>)}</tbody></table></div>}</section>
    <section className="adminAffiliateCard adminAffiliateDirectory"><div className="adminAffiliateDirectoryHeading"><div><span className="affiliateSectionLabel">Partners</span><h2>Current affiliates</h2></div><span className="affiliateCount">{affiliates.length} total</span></div>{affiliates.length === 0 ? <div className="adminAffiliateEmpty"><span>↗</span><h3>No affiliates yet</h3><p>Your invited partners will appear here.</p></div> : <div className="adminAffiliateTableWrap"><table className="adminAffiliateTable"><thead><tr><th>Affiliate</th><th>Status</th><th>Referrals</th><th>Pending</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{affiliates.map((affiliate) => <tr key={affiliate.id}><td><strong>{affiliate.code}</strong><span>{affiliate.email}</span></td><td><span className={`adminAffiliateStatus adminAffiliateStatus--${affiliate.status.toLowerCase()}`}><i />{affiliate.status === "ACTIVE" ? "Active" : "Deactivated"}</span></td><td>{affiliate.referrals}</td><td>{affiliate.pendingCommissions}</td><td><div className="adminAffiliateActions"><button type="button" className="adminAffiliateCopy" onClick={() => copyLink(affiliate)} disabled={affiliate.status !== "ACTIVE"} aria-live="polite"><CopyIcon />{copiedId === affiliate.id ? "Copied" : "Copy link"}</button>{affiliate.status === "ACTIVE" && <button type="button" className="adminAffiliateDeactivate" disabled={deactivatingId === affiliate.id} onClick={() => deactivate(affiliate)}>{deactivatingId === affiliate.id ? "Deactivating…" : "Deactivate"}</button>}</div></td></tr>)}</tbody></table></div>}</section>
  </div></main></>;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session?.user?.id) return { redirect: { destination: "/auth/login?next=/admin/affiliates", permanent: false } };
  if (!(await hasFreshUserRole(session, new Set(["ADMIN"])))) return { notFound: true };
  const affiliates = await prisma.affiliate.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, code: true, status: true, owner: { select: { email: true } }, _count: { select: { attributions: true } }, commissions: { where: { status: "PENDING" }, select: { id: true } } } });
  let promotions: PromotionRow[] = [];
  if (stripeClient) {
    try {
      const result = await stripeClient.promotionCodes.list({ limit: 100, expand: ["data.coupon"] });
      promotions = result.data.filter((promotion) => promotion.metadata?.[STANDALONE_PROMOTION_METADATA_KEY] === "true").map((promotion) => {
        const coupon = typeof promotion.coupon === "string" ? null : promotion.coupon;
        return { id: promotion.id, code: promotion.code, active: promotion.active, percentOff: coupon?.percent_off || 0, durationMonths: coupon?.duration_in_months || 0, expiresAt: promotion.expires_at || null };
      });
    } catch (error) { console.error("standalone promotions could not be loaded", error); }
  }
  return { props: { initialAffiliates: affiliates.map((affiliate) => ({ id: affiliate.id, code: affiliate.code, status: affiliate.status, email: affiliate.owner.email, referrals: affiliate._count.attributions, pendingCommissions: affiliate.commissions.length })), initialPromotions: promotions } };
};
