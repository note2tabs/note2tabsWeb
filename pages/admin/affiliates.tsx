import type { GetServerSideProps } from "next";
import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { FormEvent, useState } from "react";
import { prisma } from "../../lib/prisma";
import { hasFreshUserRole } from "../../lib/serverAuth";
import { authOptions } from "../api/auth/[...nextauth]";

type AffiliateRow = {
  id: string;
  code: string;
  status: string;
  email: string;
  referrals: number;
  pendingCommissions: number;
};

export default function AdminAffiliatesPage({ initialAffiliates }: { initialAffiliates: AffiliateRow[] }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [affiliates, setAffiliates] = useState(initialAffiliates);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch("/api/admin/affiliates/invite", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }),
    });
    const body = await response.json();
    if (response.ok) {
      setMessage(`Created affiliate ${body.affiliate.code}.`);
      setAffiliates((rows) => [{ id: body.affiliate.id, code: body.affiliate.code, status: body.affiliate.status, email, referrals: 0, pendingCommissions: 0 }, ...rows]);
      setEmail(""); setCode("");
    } else {
      setMessage(body.error || "Could not create affiliate");
    }
    setBusy(false);
  };
  const deactivate = async (affiliate: AffiliateRow) => {
    if (!window.confirm(`Deactivate ${affiliate.code}? Their link and coupon will stop working, while earned commissions remain payable.`)) return;
    setDeactivatingId(affiliate.id); setMessage("");
    const response = await fetch("/api/admin/affiliates/deactivate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ affiliateId: affiliate.id }),
    });
    const body = await response.json();
    if (response.ok) {
      setAffiliates((rows) => rows.map((row) => row.id === affiliate.id ? { ...row, status: "DEACTIVATED" } : row));
      setMessage(`${affiliate.code} was deactivated. Earned commissions will still be paid.`);
    } else {
      setMessage(body.error || "Could not deactivate affiliate");
    }
    setDeactivatingId(null);
  };
  return <>
    <Head><title>Affiliates | Note2Tabs Admin</title><meta name="robots" content="noindex,nofollow" /></Head>
    <main className="page-shell account-page"><section className="content-card"><span className="eyebrow">Admin</span><h1>Affiliate program</h1><p>Invite affiliates and stop future referrals when a partnership ends. Deactivation never removes commissions already earned.</p><form onSubmit={submit}><label className="label" htmlFor="affiliate-email">Account email</label><input id="affiliate-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><label className="label" htmlFor="affiliate-code">Referral and coupon code</label><input id="affiliate-code" className="input" required minLength={3} maxLength={32} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /><button className="button-primary" disabled={busy}>{busy ? "Creating…" : "Create Stripe affiliate"}</button></form>{message && <p role="status">{message}</p>}<div style={{ marginTop: 36 }}><h2>Current affiliates</h2>{affiliates.length === 0 ? <p>No affiliates yet.</p> : <div style={{ display: "grid", gap: 12 }}>{affiliates.map((affiliate) => <article key={affiliate.id} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}><div><strong>{affiliate.code}</strong><p style={{ margin: "4px 0 0" }}>{affiliate.email} · {affiliate.referrals} referrals · {affiliate.pendingCommissions} pending payments</p></div><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span>{affiliate.status === "ACTIVE" ? "Active" : "Deactivated"}</span>{affiliate.status === "ACTIVE" && <button type="button" className="button-secondary" disabled={deactivatingId === affiliate.id} onClick={() => deactivate(affiliate)}>{deactivatingId === affiliate.id ? "Deactivating…" : "Deactivate"}</button>}</div></article>)}</div>}</div></section></main>
  </>;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session?.user?.id) return { redirect: { destination: "/auth/login?next=/admin/affiliates", permanent: false } };
  if (!(await hasFreshUserRole(session, new Set(["ADMIN"])))) return { notFound: true };
  const affiliates = await prisma.affiliate.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, code: true, status: true,
      owner: { select: { email: true } },
      _count: { select: { attributions: true } },
      commissions: { where: { status: "PENDING" }, select: { id: true } },
    },
  });
  return { props: { initialAffiliates: affiliates.map((affiliate) => ({ id: affiliate.id, code: affiliate.code, status: affiliate.status, email: affiliate.owner.email, referrals: affiliate._count.attributions, pendingCommissions: affiliate.commissions.length })) } };
};
