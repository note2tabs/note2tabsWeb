import type { GetServerSideProps } from "next";
import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { FormEvent, useState } from "react";
import { hasFreshUserRole } from "../../lib/serverAuth";
import { authOptions } from "../api/auth/[...nextauth]";

export default function AdminAffiliatesPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch("/api/admin/affiliates/invite", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }),
    });
    const body = await response.json();
    setMessage(response.ok ? `Created affiliate ${body.affiliate.code}.` : body.error || "Could not create affiliate");
    setBusy(false);
  };
  return <>
    <Head><title>Affiliates | Note2Tabs Admin</title><meta name="robots" content="noindex,nofollow" /></Head>
    <main className="page-shell account-page"><section className="content-card"><span className="eyebrow">Admin</span><h1>Invite an affiliate</h1><p>The affiliate must already have a Note2Tabs account. Stripe creates their 10%-for-three-month promotion code and payout account.</p><form onSubmit={submit}><label className="label" htmlFor="affiliate-email">Account email</label><input id="affiliate-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><label className="label" htmlFor="affiliate-code">Referral and coupon code</label><input id="affiliate-code" className="input" required minLength={3} maxLength={32} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /><button className="button-primary" disabled={busy}>{busy ? "Creating…" : "Create Stripe affiliate"}</button></form>{message && <p role="status">{message}</p>}</section></main>
  </>;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session?.user?.id) return { redirect: { destination: "/auth/login?next=/admin/affiliates", permanent: false } };
  if (!(await hasFreshUserRole(session, new Set(["ADMIN"])))) return { notFound: true };
  return { props: {} };
};
