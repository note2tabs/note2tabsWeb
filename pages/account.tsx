import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]";
import { prisma } from "../lib/prisma";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { buildCreditsSummary, getCreditWindow } from "../lib/credits";
import { APP_HOME_URL } from "../lib/urls";

type TabJob = {
  id: string;
  sourceType: string;
  sourceLabel: string | null;
  createdAt: string;
  gteEditorId?: string | null;
};

type Props = {
  user: {
    email: string;
    name: string | null;
    role: string;
    tokensRemaining: number;
  };
  tabs: TabJob[];
  stripeReady: boolean;
  credits: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
    unlimited: boolean;
  };
};

export default function AccountPage({ user, tabs, stripeReady, credits }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdminOrMod = user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
  const isAdmin = user.role === "ADMIN";
  const resetLabel = new Date(credits.resetAt).toLocaleDateString();
  const creditsUsedLabel = credits.unlimited
    ? `${credits.used} used`
    : `${credits.used} / ${credits.limit}`;

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data?.error || "Could not delete account.");
      return;
    }
    await signOut({ callbackUrl: APP_HOME_URL });
  };

  const handleUpgrade = async () => {
    if (!stripeReady) {
      setError("Stripe not configured yet. Coming soon.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok || !data?.url) {
      setError(data?.error || "Could not start checkout.");
      return;
    }
    window.location.href = data.url;
  };

  return (
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Account</h1>
            <p className="page-subtitle">Manage your Note2Tab account.</p>
          </div>
          <Link href="/" className="button-ghost button-small">
            Back to app
          </Link>
        </div>

        <section className="card stack">
          <div className="stack">
            <div>
              <p className="page-title" style={{ fontSize: "1.4rem" }}>
                {user.email}
              </p>
              <p className="muted text-small">
                {["PREMIUM", "ADMIN", "MODERATOR", "MOD"].includes(user.role)
                  ? `Plan: ${user.role} - Unlimited`
                  : "Plan: Free"}
              </p>
              <p className="muted text-small">Account type: {user.role}</p>
            </div>
            <div className="button-row">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: APP_HOME_URL })}
                className="button-secondary button-small"
              >
                Log out
              </button>
            </div>
          </div>
          <div className="account-credits">
            <div className="stat-card">
              <span className="stat-label">This month</span>
              <span className="stat-value">{creditsUsedLabel}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Reset</span>
              <span className="stat-value">{resetLabel}</span>
            </div>
            {!credits.unlimited && (
              <div className="stat-card">
                <span className="stat-label">Remaining</span>
                <span className="stat-value">{credits.remaining}</span>
              </div>
            )}
          </div>
          <div className="button-row">
            <button
              type="button"
              onClick={handleUpgrade}
              className="button-primary"
              disabled={busy}
            >
              {stripeReady ? "Upgrade to Premium" : "Premium (coming soon)"}
            </button>
            <Link href="/gte" className="button-secondary">
              Open GTE editor
            </Link>
            {isAdminOrMod && (
              <Link href="/mod/dashboard" className="button-secondary">
                Open dashboard
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/analytics" className="button-secondary">
                Admin analytics
              </Link>
            )}
            <Link href="/reset-password" className="button-secondary">
              Change password
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="button-danger"
              disabled={busy}
            >
              Delete account
            </button>
          </div>
          {!credits.unlimited && credits.remaining === 0 && (
            <div className="notice">
              Monthly credits used. Upgrade to Premium or wait until {resetLabel}.
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </section>

        <section className="card stack">
          <div className="page-header">
            <h2 className="section-title" style={{ margin: 0 }}>
              Tab history
            </h2>
            <span className="muted text-small">{tabs.length} jobs</span>
          </div>
          {tabs.length === 0 && <p className="muted text-small">No transcriptions yet.</p>}
          <div className="stack">
            {tabs.map((job) => (
              <div key={job.id} className="card-outline">
                <div className="page-header" style={{ gap: "12px" }}>
                  <Link href={`/tabs/${job.id}`} className="stack" style={{ gap: "4px" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {job.sourceLabel || "Unknown source"}
                    </p>
                    <p className="muted text-small" style={{ margin: 0 }}>
                      {job.sourceType} - {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </Link>
                  <Link
                    href={job.gteEditorId ? `/gte/${job.gteEditorId}` : `/tabs/${job.id}/edit`}
                    className="button-secondary button-small"
                  >
                    {job.gteEditorId ? "Open GTE" : "Edit in GTE"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.email || !session.user.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, role: true, tokensRemaining: true },
  });

  const tabs = await prisma.tabJob.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, sourceType: true, sourceLabel: true, createdAt: true, gteEditorId: true },
  });

  const stripeReady = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PREMIUM_MONTHLY
  );
  const creditWindow = getCreditWindow();
  const monthlyJobs = await prisma.tabJob.findMany({
    where: {
      userId: session.user.id,
      createdAt: {
        gte: creditWindow.start,
        lt: creditWindow.resetAt,
      },
    },
    select: { durationSec: true },
  });
  const role = user?.role || "FREE";
  const isPremium = role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";
  const credits = buildCreditsSummary(
    monthlyJobs.map((job) => job.durationSec),
    creditWindow.resetAt,
    isPremium
  );

  return {
    props: {
      user: user || {
        email: session.user.email,
        name: session.user.name || null,
        role: "FREE",
        tokensRemaining: 0,
      },
      tabs: tabs.map((job) => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
      })),
      stripeReady,
      credits,
    },
  };
};
