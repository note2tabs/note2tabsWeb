import { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import Link from "next/link";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { toLegacyName } from "../../lib/analyticsV2/canonical";

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
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Moderator Dashboard</h1>
            <p className="page-subtitle">View analytics and consent snapshots.</p>
          </div>
          <Link href="/" className="button-ghost button-small">
            Back to app
          </Link>
        </div>

        <div className="stack" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div className="card">
            <p className="muted text-small">Total events</p>
            <p style={{ fontSize: "1.6rem", margin: 0 }}>{stats.totalEvents}</p>
          </div>
          <div className="card">
            <p className="muted text-small">Total consents</p>
            <p style={{ fontSize: "1.6rem", margin: 0 }}>{stats.totalConsents}</p>
          </div>
          <div className="card">
            <p className="muted text-small">Event types</p>
            <div className="stack" style={{ gap: "6px" }}>
              {Object.entries(stats.eventsByType).map(([k, v]) => (
                <div key={k} className="page-header" style={{ gap: "12px" }}>
                  <span>{k}</span>
                  <span className="muted text-small">{v}</span>
                </div>
              ))}
              {Object.keys(stats.eventsByType).length === 0 && (
                <p className="muted text-small">No events</p>
              )}
            </div>
          </div>
        </div>

        <section className="card stack">
          <div className="page-header">
            <h2 className="section-title" style={{ margin: 0 }}>
              Recent analytics events
            </h2>
            <p className="muted text-small">{analytics.length} shown</p>
          </div>
          <div className="card-outline" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Path</th>
                  <th>Browser</th>
                  <th>OS</th>
                  <th>Device</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((row) => (
                  <tr key={row.id}>
                    <td>{row.event}</td>
                    <td>{row.path || "-"}</td>
                    <td>{row.browser || "-"}</td>
                    <td>{row.os || "-"}</td>
                    <td>{row.deviceType || "-"}</td>
                    <td className="muted text-small">{new Date(row.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {analytics.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted text-small" style={{ textAlign: "center" }}>
                      No analytics events yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card stack">
          <div className="page-header">
            <h2 className="section-title" style={{ margin: 0 }}>
              Recent consents
            </h2>
            <p className="muted text-small">{consents.length} shown</p>
          </div>
          <div className="card-outline" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Granted</th>
                  <th>User</th>
                  <th>Session</th>
                  <th>Fingerprint</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {consents.map((row) => (
                  <tr key={row.id}>
                    <td>{row.granted ? "Yes" : "No"}</td>
                    <td>{row.userId || "-"}</td>
                    <td>{row.sessionId || "-"}</td>
                    <td>{row.fingerprintId || "-"}</td>
                    <td className="muted text-small">{new Date(row.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {consents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted text-small" style={{ textAlign: "center" }}>
                      No consent records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
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

  const readsEnabled = (process.env.ANALYTICS_V2_READS_ENABLED || "false").toLowerCase() === "true";

  const analytics = readsEnabled
    ? (
        await prisma.analyticsEventV2.findMany({
          orderBy: { ts: "desc" },
          take: 50,
          select: {
            id: true,
            name: true,
            legacyEventName: true,
            path: true,
            referrer: true,
            uaBrowser: true,
            uaOs: true,
            uaDevice: true,
            ts: true,
          },
        })
      ).map((row) => ({
        id: row.id.toString(),
        event: toLegacyName(row.name, row.legacyEventName),
        path: row.path,
        referer: row.referrer,
        browser: row.uaBrowser,
        os: row.uaOs,
        deviceType: row.uaDevice,
        createdAt: row.ts,
      }))
    : await prisma.analyticsEvent.findMany({
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

  const consents = readsEnabled
    ? (
        await prisma.analyticsConsentSubject.findMany({
          orderBy: { updatedAt: "desc" },
          take: 50,
          select: {
            id: true,
            userId: true,
            anonId: true,
            fingerprintHash: true,
            state: true,
            updatedAt: true,
          },
        })
      ).map((row) => ({
        id: row.id.toString(),
        userId: row.userId,
        sessionId: row.anonId,
        fingerprintId: row.fingerprintHash,
        granted: row.state === "granted",
        createdAt: row.updatedAt,
      }))
    : await prisma.userConsent.findMany({
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

  const eventsByType: Record<string, number> = {};
  for (const row of analytics) {
    eventsByType[row.event] = (eventsByType[row.event] || 0) + 1;
  }

  return {
    props: {
      analytics: analytics.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      consents: consents.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      stats: {
        totalEvents: analytics.length,
        totalConsents: consents.length,
        eventsByType,
      },
    },
  };
};
