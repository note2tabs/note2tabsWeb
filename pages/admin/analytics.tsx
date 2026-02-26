import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  getSummaryStats,
  getDailyTimeSeries,
  getConversionFunnel,
  getDropoffPoints,
  getDeviceBreakdown,
  getErrorStats,
  getTopUsers,
  getRecentEvents,
  getUsersActivity,
  getGteEditorStats,
  getParityMetrics,
  getModerationSnapshot,
} from "../../lib/analyticsQueries";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";

const TimeSeriesChart = dynamic(
  () => import("../../components/AdminChartsClient").then((m) => m.TimeSeriesChart),
  { ssr: false }
);
const FunnelBars = dynamic(
  () => import("../../components/AdminChartsClient").then((m) => m.FunnelBars),
  { ssr: false }
);
const DonutChart = dynamic(
  () => import("../../components/AdminChartsClient").then((m) => m.DonutChart),
  { ssr: false }
);
const ErrorBarChart = dynamic(
  () => import("../../components/AdminChartsClient").then((m) => m.ErrorBarChart),
  { ssr: false }
);

type DailyPoint = Awaited<ReturnType<typeof getDailyTimeSeries>>[number];
type Funnel = Awaited<ReturnType<typeof getConversionFunnel>>;
type Dropoff = Awaited<ReturnType<typeof getDropoffPoints>>;
type Devices = Awaited<ReturnType<typeof getDeviceBreakdown>>;
type Errors = Awaited<ReturnType<typeof getErrorStats>>;
type TopUser = Awaited<ReturnType<typeof getTopUsers>>[number];
type RecentEvent = Awaited<ReturnType<typeof getRecentEvents>>[number];
type GteStats = Awaited<ReturnType<typeof getGteEditorStats>>;
type ModerationSnapshot = Awaited<ReturnType<typeof getModerationSnapshot>>;
type Parity = Awaited<ReturnType<typeof getParityMetrics>>;

type AnalyticsView = "overview" | "gte" | "users" | "events" | "moderation" | "parity";

const presetRanges: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const ADMIN_VIEWS: AnalyticsView[] = ["overview", "gte", "users", "events", "moderation", "parity"];
const MODERATOR_VIEWS: AnalyticsView[] = ["moderation"];

const VIEW_META: Record<AnalyticsView, { label: string; description: string }> = {
  overview: {
    label: "Overview",
    description: "Core usage, conversion, devices, and reliability.",
  },
  gte: {
    label: "GTE",
    description: "Editor creation and session behavior.",
  },
  users: {
    label: "Users",
    description: "Account-level activity and engagement.",
  },
  events: {
    label: "Events",
    description: "Raw recent event stream.",
  },
  moderation: {
    label: "Moderation",
    description: "Moderation snapshots for events and consent.",
  },
  parity: {
    label: "Parity",
    description: "Old vs v2 metric parity checks.",
  },
};

type SerializedModerationSnapshot = {
  analytics: Array<Omit<ModerationSnapshot["analytics"][number], "createdAt"> & { createdAt: string }>;
  consents: Array<Omit<ModerationSnapshot["consents"][number], "createdAt"> & { createdAt: string }>;
  stats: ModerationSnapshot["stats"];
};

type SerializedGteStats = Omit<GteStats, "createdPerUser" | "recentCreated"> & {
  createdPerUser: Array<Omit<GteStats["createdPerUser"][number], "lastCreatedAt"> & { lastCreatedAt: string | null }>;
  recentCreated: Array<Omit<GteStats["recentCreated"][number], "createdAt"> & { createdAt: string }>;
};

type Props = {
  role: string;
  range: string;
  from: string;
  to: string;
  activeView: AnalyticsView;
  availableViews: AnalyticsView[];
  summary: Awaited<ReturnType<typeof getSummaryStats>> | null;
  daily: DailyPoint[];
  funnel: Funnel | null;
  dropoff: Dropoff | null;
  devices: Devices | null;
  errors: Errors | null;
  topUsers: Array<Omit<TopUser, "lastActive"> & { lastActive: string | null }>;
  recentEvents: Array<Omit<RecentEvent, "createdAt"> & { createdAt: string }>;
  usersActivity: Array<
    Omit<Awaited<ReturnType<typeof getUsersActivity>>[number], "lastActive"> & { lastActive: string | null }
  >;
  gteStats: SerializedGteStats | null;
  parity: Parity | null;
  moderation: SerializedModerationSnapshot;
};

export default function AnalyticsDashboard(props: Props) {
  const {
    role,
    range,
    from,
    to,
    activeView,
    availableViews,
    summary,
    daily,
    funnel,
    dropoff,
    devices,
    errors,
    topUsers,
    recentEvents,
    usersActivity,
    gteStats,
    parity,
    moderation,
  } = props;

  const viewMeta = VIEW_META[activeView];
  const isAdmin = role === "ADMIN";

  const viewHref = (view: AnalyticsView) => {
    return viewHrefForRange(view, range);
  };

  const viewHrefForRange = (view: AnalyticsView, rangeValue: string) => {
    const search = new URLSearchParams();
    search.set("range", rangeValue);
    search.set("view", view);
    return `/admin/analytics?${search.toString()}`;
  };

  return (
    <>
      <Head>
        <title>Analytics Hub - Note2Tabs</title>
      </Head>
      <main className="page">
        <div className="container stack">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Analytics Hub</h1>
              <p className="text-sm text-slate-600">{viewMeta.description}</p>
              <p className="text-xs text-slate-500">
                Range: {from} {"->"} {to}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {Object.entries(presetRanges).map(([key, days]) => (
                <Link key={key} href={viewHrefForRange(activeView, key)} className="button-secondary button-small">
                  Last {days}d
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[240px,1fr]">
            <aside className="card stack" style={{ alignSelf: "start" }}>
              <SectionHeader title="Analytics Views" />
              <div className="stack" style={{ gap: "8px" }}>
                {availableViews.map((view) => {
                  const isActive = view === activeView;
                  return (
                    <Link
                      key={view}
                      href={viewHref(view)}
                      className={isActive ? "button-primary button-small" : "button-secondary button-small"}
                    >
                      {VIEW_META[view].label}
                    </Link>
                  );
                })}
              </div>
              {!isAdmin && (
                <p className="muted text-small">
                  Your role currently has access to moderation-focused analytics only.
                </p>
              )}
            </aside>

            <section className="stack">
              {activeView === "overview" && (
                <OverviewView summary={summary} daily={daily} funnel={funnel} dropoff={dropoff} devices={devices} errors={errors} />
              )}

              {activeView === "gte" && <GteView gteStats={gteStats} />}

              {activeView === "users" && <UsersView topUsers={topUsers} usersActivity={usersActivity} />}

              {activeView === "events" && <EventsView recentEvents={recentEvents} />}

              {activeView === "moderation" && <ModerationView moderation={moderation} />}

              {activeView === "parity" && <ParityView parity={parity} />}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function OverviewView({
  summary,
  daily,
  funnel,
  dropoff,
  devices,
  errors,
}: {
  summary: Props["summary"];
  daily: Props["daily"];
  funnel: Props["funnel"];
  dropoff: Props["dropoff"];
  devices: Props["devices"];
  errors: Props["errors"];
}) {
  if (!summary || !funnel || !dropoff || !devices || !errors) {
    return <div className="card">Overview data is not available for this role.</div>;
  }

  const funnelSteps = [
    { label: "Visitors", value: funnel.step1_visitors },
    {
      label: "Signup CTA",
      value: funnel.step2_signup_cta_clicked,
      pct: pct(funnel.step1_visitors, funnel.step2_signup_cta_clicked),
    },
    {
      label: "Signup opened",
      value: funnel.step3_signup_opened,
      pct: pct(funnel.step2_signup_cta_clicked, funnel.step3_signup_opened),
    },
    {
      label: "Signup completed",
      value: funnel.step4_signup_success,
      pct: pct(funnel.step3_signup_opened, funnel.step4_signup_success),
    },
    {
      label: "First transcription",
      value: funnel.step5_first_transcription,
      pct: pct(funnel.step4_signup_success, funnel.step5_first_transcription),
    },
  ];

  const deviceData = Object.entries(devices.deviceTypeCounts).map(([name, value]) => ({ name, value }));
  const browserData = Object.entries(devices.browserCounts).map(([name, value]) => ({ name, value }));

  return (
    <>
      <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card title="Visitors" value={summary.totalVisitors} />
        <Card title="Signups" value={summary.totalSignups} />
        <Card title="Active users" value={summary.totalActiveUsers} />
        <Card title="Transcriptions" value={summary.totalTranscriptions} />
        <Card title="Success rate" value={`${summary.successRate.toFixed(1)}%`} />
        <Card title="Avg transcriptions / user" value={summary.avgTranscriptionsPerUser.toFixed(2)} />
      </section>

      <section className="card stack">
        <SectionHeader title="Usage over time" />
        <TimeSeriesChart data={daily} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card stack">
          <SectionHeader title="Conversion funnel" />
          <FunnelBars steps={funnelSteps} />
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs text-slate-300">
            {funnelSteps.map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-200 bg-white/60 p-2">
                <p className="font-semibold">{s.label}</p>
                <p className="text-slate-900">{s.value}</p>
                {s.pct !== undefined && <p className="text-slate-500">{s.pct}%</p>}
              </div>
            ))}
          </div>
        </div>
        <div className="card stack">
          <SectionHeader title="Drop-off analysis" />
          <div className="space-y-2 text-sm text-slate-800">
            <BarItem label="Left after homepage only" value={dropoff.dropoffAfterHomepage} />
            <BarItem label="Abandoned signup" value={dropoff.dropoffAfterSignupOpen} />
            <BarItem
              label="Started but never completed transcription"
              value={dropoff.dropoffAfterTranscriptionStart}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card stack">
          <SectionHeader title="Device types" />
          <DonutChart data={deviceData} />
        </div>
        <div className="card stack">
          <SectionHeader title="Browsers" />
          <DonutChart data={browserData} />
        </div>
        <div className="card stack">
          <SectionHeader title="Error hotspots" />
          <p className="text-sm text-slate-300">Total failed: {errors.totalFailed}</p>
          <ErrorBarChart data={errors.byType} />
        </div>
      </section>
    </>
  );
}

function GteView({ gteStats }: { gteStats: Props["gteStats"] }) {
  if (!gteStats) {
    return <div className="card">GTE data is not available for this role.</div>;
  }

  return (
    <>
      <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card title="Editors created" value={gteStats.createdTotal} />
        <Card title="Editor visits" value={gteStats.visitTotal} />
        <Card title="Unique editor users" value={gteStats.uniqueVisitUsers} />
        <Card title="Tracked sessions" value={gteStats.sessionsWithDuration} />
        <Card title="Avg session" value={formatDuration(gteStats.avgSessionDurationSec)} />
        <Card title="P95 session" value={formatDuration(gteStats.p95SessionDurationSec)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card stack">
          <SectionHeader title="Editor creations per user" />
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="px-2 py-1">Email</th>
                  <th className="px-2 py-1">Role</th>
                  <th className="px-2 py-1">Editors created</th>
                  <th className="px-2 py-1">Last created</th>
                </tr>
              </thead>
              <tbody>
                {gteStats.createdPerUser.map((row) => (
                  <tr key={row.userId} className="border-t border-slate-200">
                    <td className="px-2 py-1">{row.email}</td>
                    <td className="px-2 py-1">{row.role}</td>
                    <td className="px-2 py-1">{row.count}</td>
                    <td className="px-2 py-1 text-slate-600">
                      {row.lastCreatedAt ? new Date(row.lastCreatedAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
                {gteStats.createdPerUser.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-slate-500">
                      No editor creations in range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card stack">
          <SectionHeader title="Recent editor creations" />
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="px-2 py-1">Time</th>
                  <th className="px-2 py-1">Editor</th>
                  <th className="px-2 py-1">User</th>
                  <th className="px-2 py-1">Source</th>
                </tr>
              </thead>
              <tbody>
                {gteStats.recentCreated.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-2 py-1 text-slate-600">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-2 py-1">{row.editorId || "-"}</td>
                    <td className="px-2 py-1">{row.userEmail || "-"}</td>
                    <td className="px-2 py-1">{row.path || "-"}</td>
                  </tr>
                ))}
                {gteStats.recentCreated.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-slate-500">
                      No editor creations recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card stack">
        <SectionHeader title="Daily editor activity" />
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Editors created</th>
                <th className="px-2 py-1">Editor visits</th>
              </tr>
            </thead>
            <tbody>
              {gteStats.createdDaily.map((row, idx) => (
                <tr key={row.date} className="border-t border-slate-200">
                  <td className="px-2 py-1">{row.date}</td>
                  <td className="px-2 py-1">{row.count}</td>
                  <td className="px-2 py-1">{gteStats.visitedDaily[idx]?.count ?? 0}</td>
                </tr>
              ))}
              {gteStats.createdDaily.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                    No daily editor metrics in range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function UsersView({ topUsers, usersActivity }: { topUsers: Props["topUsers"]; usersActivity: Props["usersActivity"] }) {
  return (
    <>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card stack">
          <SectionHeader title="Top users by transcriptions" />
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="px-2 py-1">Email</th>
                  <th className="px-2 py-1">Role</th>
                  <th className="px-2 py-1">Total</th>
                  <th className="px-2 py-1">Last active</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.userId || u.email} className="border-t border-slate-200">
                    <td className="px-2 py-1">{u.email}</td>
                    <td className="px-2 py-1">{u.role}</td>
                    <td className="px-2 py-1">{u.totalTranscriptions}</td>
                    <td className="px-2 py-1 text-slate-600">
                      {u.lastActive ? new Date(u.lastActive).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
                {topUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-slate-500">
                      No data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card stack">
        <SectionHeader title="All users & activity (last 100 accounts)" />
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="px-2 py-1">Email</th>
                <th className="px-2 py-1">Role</th>
                <th className="px-2 py-1">Signups</th>
                <th className="px-2 py-1">Transcriptions (range)</th>
                <th className="px-2 py-1">Transcriptions (total)</th>
                <th className="px-2 py-1">Last active</th>
              </tr>
            </thead>
            <tbody>
              {usersActivity.map((u) => (
                <tr key={u.id} className="border-t border-slate-200">
                  <td className="px-2 py-1">{u.email}</td>
                  <td className="px-2 py-1">{u.role}</td>
                  <td className="px-2 py-1">{u.signupEvents}</td>
                  <td className="px-2 py-1">{u.rangeTranscriptions}</td>
                  <td className="px-2 py-1">{u.totalTranscriptions}</td>
                  <td className="px-2 py-1 text-slate-600">{u.lastActive ? new Date(u.lastActive).toLocaleString() : "-"}</td>
                </tr>
              ))}
              {usersActivity.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-3 text-center text-slate-500">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function EventsView({ recentEvents }: { recentEvents: Props["recentEvents"] }) {
  return (
    <section className="card stack">
      <SectionHeader title="Recent events" />
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="px-2 py-1">Time</th>
              <th className="px-2 py-1">Event</th>
              <th className="px-2 py-1">User</th>
              <th className="px-2 py-1">Path</th>
            </tr>
          </thead>
          <tbody>
            {recentEvents.map((e) => (
              <tr key={e.id} className="border-t border-slate-200">
                <td className="px-2 py-1 text-slate-600">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="px-2 py-1">{e.event}</td>
                <td className="px-2 py-1">{e.userEmail || "-"}</td>
                <td className="px-2 py-1">{e.path || "-"}</td>
              </tr>
            ))}
            {recentEvents.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-slate-500">
                  No events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModerationView({ moderation }: { moderation: Props["moderation"] }) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-3">
        <Card title="Total events" value={moderation.stats.totalEvents} />
        <Card title="Total consents" value={moderation.stats.totalConsents} />
        <div className="card stack">
          <p className="muted text-small">Event types</p>
          <div className="stack" style={{ gap: "6px" }}>
            {Object.entries(moderation.stats.eventsByType).map(([k, v]) => (
              <div key={k} className="page-header" style={{ gap: "12px" }}>
                <span>{k}</span>
                <span className="muted text-small">{v}</span>
              </div>
            ))}
            {Object.keys(moderation.stats.eventsByType).length === 0 && (
              <p className="muted text-small">No events</p>
            )}
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="page-header">
          <SectionHeader title="Recent analytics events" />
          <p className="muted text-small">{moderation.analytics.length} shown</p>
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
              {moderation.analytics.map((row) => (
                <tr key={row.id}>
                  <td>{row.event}</td>
                  <td>{row.path || "-"}</td>
                  <td>{row.browser || "-"}</td>
                  <td>{row.os || "-"}</td>
                  <td>{row.deviceType || "-"}</td>
                  <td className="muted text-small">{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {moderation.analytics.length === 0 && (
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
          <SectionHeader title="Recent consents" />
          <p className="muted text-small">{moderation.consents.length} shown</p>
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
              {moderation.consents.map((row) => (
                <tr key={row.id}>
                  <td>{row.granted ? "Yes" : "No"}</td>
                  <td>{row.userId || "-"}</td>
                  <td>{row.sessionId || "-"}</td>
                  <td>{row.fingerprintId || "-"}</td>
                  <td className="muted text-small">{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {moderation.consents.length === 0 && (
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
    </>
  );
}

function ParityView({ parity }: { parity: Props["parity"] }) {
  if (!parity) {
    return <div className="card">Parity checks are disabled or unavailable.</div>;
  }

  return (
    <section className="card stack">
      <SectionHeader title="Old vs V2 parity (last 7d)" />
      <p className="text-sm text-slate-600">Threshold: {parity.threshold}% with minimum-volume guard.</p>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="px-2 py-1">Metric</th>
              <th className="px-2 py-1">Old</th>
              <th className="px-2 py-1">V2</th>
              <th className="px-2 py-1">Diff %</th>
              <th className="px-2 py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Visitors", row: parity.visitors },
              { label: "Pageviews", row: parity.pageviews },
              { label: "Transcription started", row: parity.transcriptionStarted },
              { label: "Transcription succeeded", row: parity.transcriptionSucceeded },
              { label: "Transcription failed", row: parity.transcriptionFailed },
              { label: "GTE sessions", row: parity.gteSessionsCount },
              { label: "GTE duration (ms)", row: parity.gteSessionsDurationMs },
            ].map(({ label, row }) => (
              <tr key={label} className="border-t border-slate-200">
                <td className="px-2 py-1">{label}</td>
                <td className="px-2 py-1">{row.oldValue}</td>
                <td className="px-2 py-1">{row.v2Value}</td>
                <td className="px-2 py-1">{row.diffPct.toFixed(2)}%</td>
                <td className="px-2 py-1">{row.flagged ? "Alert" : "OK"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Card({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="card">
      <p className="muted text-small">{title}</p>
      <p style={{ fontSize: "1.6rem", fontWeight: 600, margin: 0 }}>{value}</p>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="section-title" style={{ margin: 0 }}>
      {title}
    </h2>
  );
}

function BarItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-outline" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function pct(prev: number, next: number) {
  if (!prev) return 0;
  return Math.round((next / prev) * 100);
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}m ${secs}s`;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const role = session?.user?.role || "";
  const isAdmin = role === "ADMIN";
  const isModerator = role === "MODERATOR" || role === "MOD";

  if (!session?.user?.id || (!isAdmin && !isModerator)) {
    return {
      redirect: { destination: "/", permanent: false },
    };
  }

  const range = (ctx.query.range as string) || "30d";
  const days = presetRanges[range] || 30;
  const parityEnabled = (process.env.ANALYTICS_ADMIN_PARITY_ENABLED || "true").toLowerCase() !== "false";

  const availableViews = isAdmin ? ADMIN_VIEWS : MODERATOR_VIEWS;
  const requestedView = (ctx.query.view as string) || availableViews[0];
  const activeView = availableViews.includes(requestedView as AnalyticsView)
    ? (requestedView as AnalyticsView)
    : availableViews[0];

  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));

  const moderationPromise = getModerationSnapshot(50);

  let summary: Awaited<ReturnType<typeof getSummaryStats>> | null = null;
  let daily: DailyPoint[] = [];
  let funnel: Funnel | null = null;
  let dropoff: Dropoff | null = null;
  let devices: Devices | null = null;
  let errors: Errors | null = null;
  let topUsers: TopUser[] = [];
  let recentEvents: RecentEvent[] = [];
  let usersActivity: Awaited<ReturnType<typeof getUsersActivity>> = [];
  let gteStats: GteStats | null = null;
  let parity: Parity | null = null;

  if (isAdmin) {
    const parityFrom = new Date();
    parityFrom.setDate(parityFrom.getDate() - 6);

    [summary, daily, funnel, dropoff, devices, errors, topUsers, recentEvents, usersActivity, gteStats, parity] =
      await Promise.all([
        getSummaryStats(from, to),
        getDailyTimeSeries(from, to),
        getConversionFunnel(from, to),
        getDropoffPoints(from, to),
        getDeviceBreakdown(from, to),
        getErrorStats(from, to),
        getTopUsers(from, to, 10),
        getRecentEvents(from, to, 50),
        getUsersActivity(from, to, 100),
        getGteEditorStats(from, to, 25),
        parityEnabled ? getParityMetrics(parityFrom, to) : Promise.resolve(null),
      ]);
  }

  const moderation = await moderationPromise;

  return {
    props: {
      role,
      range,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      activeView,
      availableViews,
      summary,
      daily,
      funnel,
      dropoff,
      devices,
      errors,
      topUsers: topUsers.map((u) => ({
        ...u,
        lastActive: u.lastActive ? u.lastActive.toISOString() : null,
      })),
      recentEvents: recentEvents.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      usersActivity: usersActivity.map((u) => ({
        ...u,
        lastActive: u.lastActive ? u.lastActive.toISOString() : null,
      })),
      gteStats: gteStats
        ? {
            ...gteStats,
            createdPerUser: gteStats.createdPerUser.map((row) => ({
              ...row,
              lastCreatedAt: row.lastCreatedAt ? row.lastCreatedAt.toISOString() : null,
            })),
            recentCreated: gteStats.recentCreated.map((row) => ({
              ...row,
              createdAt: row.createdAt.toISOString(),
            })),
          }
        : null,
      parity,
      moderation: {
        analytics: moderation.analytics.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        consents: moderation.consents.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        stats: moderation.stats,
      },
    },
  };
};
