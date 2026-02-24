import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { authOptions } from "./api/auth/[...nextauth]";
import { buildCreditsSummary, getCreditWindow } from "../lib/credits";
import { prisma } from "../lib/prisma";

type Props = {
  user: {
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
    isEmailVerified: boolean;
  };
  stripeReady: boolean;
  credits: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
    unlimited: boolean;
  };
};

export default function AccountPage({ user, stripeReady, credits }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdminOrMod = user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
  const isAdmin = user.role === "ADMIN";
  const isPremium =
    user.role === "PREMIUM" || user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
  const resetLabel = new Date(credits.resetAt).toLocaleDateString();
  const createdLabel = new Date(user.createdAt).toLocaleDateString();
  const creditsUsedLabel = `${credits.used} / ${credits.limit}`;
  const verifyHref = `/auth/verify-email?email=${encodeURIComponent(user.email)}`;

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.href = "/";
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
            <p className="page-subtitle">Overview of your Note2Tabs account and credits.</p>
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
                {isPremium
                  ? `Plan: ${user.role} - 50 credits/month (roll over)`
                  : "Plan: Free - 10 credits/month"}
              </p>
              <p className="muted text-small">Account type: {user.role}</p>
              <p className="muted text-small">Created: {createdLabel}</p>
              <p className="muted text-small">Email verified: {user.isEmailVerified ? "Yes" : "No"}</p>
            </div>
            <div className="button-row">
              <button type="button" onClick={handleSignOut} className="button-secondary button-small">
                Log out
              </button>
              <Link href="/settings" className="button-secondary button-small">
                Settings
              </Link>
              <Link href="/tabs" className="button-secondary button-small">
                Saved tabs
              </Link>
            </div>
          </div>

          {!user.isEmailVerified && (
            <div className="notice">
              Please verify your email before using the transcriber.
              <div className="button-row" style={{ marginTop: 8 }}>
                <Link href={verifyHref} className="button-link">
                  Open verification page
                </Link>
                <Link href="/settings" className="button-link">
                  Email settings
                </Link>
              </div>
            </div>
          )}

          <div className="account-credits">
            <div className="stat-card">
              <span className="stat-label">Credits used</span>
              <span className="stat-value">{creditsUsedLabel}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Next credits</span>
              <span className="stat-value">{resetLabel}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Remaining</span>
              <span className="stat-value">{credits.remaining}</span>
            </div>
          </div>

          <div className="button-row">
            <button type="button" onClick={handleUpgrade} className="button-primary" disabled={busy}>
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
            {isAdmin && (
              <Link href="/admin/blog" className="button-secondary">
                Open blog CMS
              </Link>
            )}
          </div>

          {credits.remaining === 0 && (
            <div className="notice">
              {isPremium
                ? `Credits used. More credits arrive on ${resetLabel}.`
                : `Monthly credits used. Upgrade to Premium or wait until ${resetLabel}.`}
            </div>
          )}
          {error && <div className="error">{error}</div>}
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
    select: {
      email: true,
      name: true,
      role: true,
      createdAt: true,
      emailVerified: true,
      emailVerifiedBool: true,
    },
  });

  const stripeReady = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PREMIUM_MONTHLY
  );
  const creditWindow = getCreditWindow({ userCreatedAt: user?.createdAt });
  const role = user?.role || "FREE";
  const isPremium = role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";
  const creditJobs = await prisma.tabJob.findMany({
    where: isPremium
      ? { userId: session.user.id }
      : {
          userId: session.user.id,
          createdAt: {
            gte: creditWindow.start,
            lt: creditWindow.resetAt,
          },
        },
    select: { durationSec: true },
  });
  const credits = buildCreditsSummary({
    durations: creditJobs.map((job) => job.durationSec),
    resetAt: creditWindow.resetAt,
    isPremium,
    userCreatedAt: user?.createdAt,
  });

  return {
    props: {
      user: user
        ? {
            ...user,
            createdAt: user.createdAt.toISOString(),
            isEmailVerified: Boolean(user.emailVerifiedBool || user.emailVerified),
          }
        : {
            email: session.user.email,
            name: session.user.name || null,
            role: "FREE",
            createdAt: new Date().toISOString(),
            isEmailVerified: Boolean(session.user.isEmailVerified),
          },
      stripeReady,
      credits,
    },
  };
};
