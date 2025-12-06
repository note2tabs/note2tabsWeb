import { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import Link from "next/link";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";

type AnalyticsRow = {
  id: string;
  event: string;
  path: string | null;
  referer: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  createdAt: string;
};

type ConsentRow = {
  id: string;
  userId: string | null;
  sessionId: string | null;
  fingerprintId: string | null;
  granted: boolean;
  createdAt: string;
};

type Props = {
  analytics: AnalyticsRow[];
  consents: ConsentRow[];
  stats: {
    totalEvents: number;
    totalConsents: number;
    eventsByType: Record<string, number>;
  };
};

export default function ModDashboard({ analytics, consents, stats }: Props) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Moderator Dashboard</h1>
            <p className="text-sm text-slate-400">View analytics and consent snapshots.</p>
          </div>
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">
            ← Back to app
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs text-slate-400">Total events</p>
            <p className="text-2xl font-semibold">{stats.totalEvents}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs text-slate-400">Total consents</p>
            <p className="text-2xl font-semibold">{stats.totalConsents}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs text-slate-400">Event types</p>
            <div className="text-sm text-slate-200 space-y-1">
              {Object.entries(stats.eventsByType).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="text-slate-400">{v}</span>
                </div>
              ))}
              {Object.keys(stats.eventsByType).length === 0 && (
                <p className="text-xs text-slate-500">No events</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent analytics events</h2>
            <p className="text-xs text-slate-400">{analytics.length} shown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-slate-200">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="px-2 py-1">Event</th>
                  <th className="px-2 py-1">Path</th>
                  <th className="px-2 py-1">Browser</th>
                  <th className="px-2 py-1">OS</th>
                  <th className="px-2 py-1">Device</th>
                  <th className="px-2 py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800">
                    <td className="px-2 py-1">{row.event}</td>
                    <td className="px-2 py-1">{row.path || "-"}</td>
                    <td className="px-2 py-1">{row.browser || "-"}</td>
                    <td className="px-2 py-1">{row.os || "-"}</td>
                    <td className="px-2 py-1">{row.deviceType || "-"}</td>
                    <td className="px-2 py-1 text-slate-400">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {analytics.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-3 text-center text-slate-500">
                      No analytics events yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent consents</h2>
            <p className="text-xs text-slate-400">{consents.length} shown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-slate-200">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="px-2 py-1">Granted</th>
                  <th className="px-2 py-1">User</th>
                  <th className="px-2 py-1">Session</th>
                  <th className="px-2 py-1">Fingerprint</th>
                  <th className="px-2 py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {consents.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800">
                    <td className="px-2 py-1">{row.granted ? "Yes" : "No"}</td>
                    <td className="px-2 py-1">{row.userId || "-"}</td>
                    <td className="px-2 py-1">{row.sessionId || "-"}</td>
                    <td className="px-2 py-1">{row.fingerprintId || "-"}</td>
                    <td className="px-2 py-1 text-slate-400">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {consents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                      No consent records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const role = session?.user?.role || "";
  if (!session?.user?.id || (role !== "ADMIN" && role !== "MODERATOR" && role !== "MOD")) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const analytics = await prisma.analyticsEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      event: true,
      path: true,
      referer: true,
      browser: true,
      os: true,
      deviceType: true,
      createdAt: true,
    },
  });

  const consents = await prisma.userConsent.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      userId: true,
      sessionId: true,
      fingerprintId: true,
      granted: true,
      createdAt: true,
    },
  });

  const eventsByType = analytics.reduce<Record<string, number>>((acc, row) => {
    acc[row.event] = (acc[row.event] || 0) + 1;
    return acc;
  }, {});

  return {
    props: {
      analytics: analytics.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      consents: consents.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
      stats: {
        totalEvents: analytics.length,
        totalConsents: consents.length,
        eventsByType,
      },
    },
  };
};
