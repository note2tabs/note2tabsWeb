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
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const isAdminOrMod = user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
  const isAdmin = user.role === "ADMIN";
  const analyticsHref = isAdmin
    ? "/admin/analytics?view=overview&range=30d"
    : "/admin/analytics?view=moderation&range=30d";
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
    setUpgradeBusy(true);
    setError(null);
    const res = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
    const data = await res.json();
    setUpgradeBusy(false);
    if (!res.ok || !data?.url) {
      setError(data?.error || "Could not start checkout.");
      return;
    }
    window.location.href = data.url;
  };

  const handleManageSubscription = async () => {
    if (!stripeReady) {
      setError("Stripe not configured yet. Subscription management is unavailable.");
      return;
    }
    setPortalBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        setError(data?.error || "Could not open subscription management.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setPortalBusy(false);
    }
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
            <div className="account-meta">
              <p className="account-email">{user.email}</p>
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
              <div className="button-row">
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
            {!isPremium && (
              <button type="button" onClick={handleUpgrade} className="button-primary" disabled={upgradeBusy}>
                {stripeReady ? "Upgrade to Premium" : "Premium (coming soon)"}
              </button>
            )}
            {isPremium && (
              <button
                type="button"
                onClick={handleManageSubscription}
                className="button-secondary"
                disabled={portalBusy}
              >
                {portalBusy ? "Opening..." : "Manage subscription"}
              </button>
            )}
            <Link href="/editor" className="button-secondary">
              Open editor
            </Link>
            {isAdminOrMod && (
              <Link href={analyticsHref} className="button-secondary">
                Open analytics hub
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
          {isPremium && (
            <p className="footnote">You can cancel your Premium subscription anytime from Manage subscription.</p>
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
  const role = user?.role || "FREE";
  const isPremium = role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";
  const creditWindow = isPremium
    ? getCreditWindow({ userCreatedAt: user?.createdAt })
    : getCreditWindow();
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
            email: user.email,
            name: user.name,
            role: user.role,
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
