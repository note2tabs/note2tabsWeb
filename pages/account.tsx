import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]";
import { prisma } from "../lib/prisma";
import { signOut } from "next-auth/react";
import { useState } from "react";

type TabJob = {
  id: string;
  sourceType: string;
  sourceLabel: string | null;
  createdAt: string;
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
};

export default function AccountPage({ user, tabs, stripeReady }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdminOrMod = user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
  const isAdmin = user.role === "ADMIN";

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
    await signOut({ callbackUrl: "/" });
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
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Account</h1>
            <p className="text-sm text-slate-400">Manage your Note2Tabs account.</p>
          </div>
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">
            ← Back to app
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold">{user.email}</p>
              <p className="text-sm text-slate-400">
                {["PREMIUM", "ADMIN", "MODERATOR", "MOD"].includes(user.role)
                  ? `Plan: ${user.role} · Unlimited minutes`
                  : `Plan: Free · Tokens remaining: ${user.tokensRemaining}`}
              </p>
              <p className="text-xs text-slate-500">
                Account type: {user.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
            >
              Log out
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleUpgrade}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              disabled={busy}
            >
              {stripeReady ? "Upgrade to Premium" : "Premium (coming soon)"}
            </button>
            {isAdminOrMod && (
              <Link
                href="/mod/dashboard"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Open dashboard
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin/analytics"
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400"
              >
                Admin analytics
              </Link>
            )}
            <Link
              href="/reset-password"
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
            >
              Change password
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              disabled={busy}
            >
              Delete account
            </button>
          </div>
          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tab history</h2>
            <Link href="/account" className="text-xs text-slate-400">
              {tabs.length} jobs
            </Link>
          </div>
          {tabs.length === 0 && (
            <p className="text-sm text-slate-400">No transcriptions yet.</p>
          )}
          <div className="space-y-2">
            {tabs.map((job) => (
              <Link
                key={job.id}
                href={`/tabs/${job.id}`}
                className="block rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 hover:border-blue-500"
              >
                <p className="text-sm font-semibold text-slate-100">{job.sourceLabel || "Unknown source"}</p>
                <p className="text-xs text-slate-500">
                  {job.sourceType} · {new Date(job.createdAt).toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        </div>
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
    select: { id: true, sourceType: true, sourceLabel: true, createdAt: true },
  });

  const stripeReady = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PREMIUM_MONTHLY
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
    },
  };
};
