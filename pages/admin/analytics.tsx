import { GetServerSideProps } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  getSummaryStats,
  getDailyTimeSeries,
  getConversionFunnel,
  getDropoffPoints,
  getDeviceBreakdown,
  getErrorStats,
  getPageViewBreakdown,
  getTopUsers,
  getRecentEvents,
  getRecentFeedback,
  getUsersActivity,
  getGteEditorStats,
  getParityMetrics,
  getModerationSnapshot,
} from "../../lib/analyticsQueries";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import NoIndexHead from "../../components/NoIndexHead";

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
type PageViews = Awaited<ReturnType<typeof getPageViewBreakdown>>;
type TopUser = Awaited<ReturnType<typeof getTopUsers>>[number];
type RecentEvent = Awaited<ReturnType<typeof getRecentEvents>>[number];
type RecentFeedback = Awaited<ReturnType<typeof getRecentFeedback>>[number];
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
  pageViews: PageViews | null;
  devices: Devices | null;
  errors: Errors | null;
  topUsers: Array<Omit<TopUser, "lastActive"> & { lastActive: string | null }>;
  recentEvents: Array<Omit<RecentEvent, "createdAt"> & { createdAt: string }>;
  recentFeedback: Array<Omit<RecentFeedback, "createdAt"> & { createdAt: string }>;
  usersActivity: Array<
    Omit<Awaited<ReturnType<typeof getUsersActivity>>[number], "lastActive"> & { lastActive: string | null }
  >;
  gteStats: SerializedGteStats | null;
  parity: Parity | null;
  moderation: SerializedModerationSnapshot;
  thisToThat: {
    provider: string;
    configured: boolean;
    remainingRequests: number | null;
    quotaLimit: number | null;
    resetAt: string | null;
    observedAt: string | null;
    source: string | null;
    fieldName: string | null;
    refreshConsumesRequest: boolean;
    refreshUsed: boolean;
    refreshError: string | null;
  } | null;
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
    pageViews,
    devices,
    errors,
    topUsers,
    recentEvents,
    recentFeedback,
    usersActivity,
    gteStats,
    parity,
    moderation,
    thisToThat,
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
      <NoIndexHead title="Analytics Hub - Note2Tabs" canonicalPath="/admin/analytics" />
      <main className="page analytics-page">
        <div className="container stack analytics-shell">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold analytics-title">Analytics Hub</h1>
              <p className="text-sm text-slate-600 analytics-subtitle">{viewMeta.description}</p>
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
                <OverviewView
                  summary={summary}
                  daily={daily}
                  funnel={funnel}
                  dropoff={dropoff}
                  pageViews={pageViews}
                  devices={devices}
                  errors={errors}
                  thisToThat={thisToThat}
                />
              )}

              {activeView === "gte" && <GteView gteStats={gteStats} />}

              {activeView === "users" && <UsersView topUsers={topUsers} usersActivity={usersActivity} />}

              {activeView === "events" && (
                <EventsView recentEvents={recentEvents} recentFeedback={recentFeedback} />
              )}

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
  pageViews,
  devices,
  errors,
  thisToThat,
}: {
  summary: Props["summary"];
  daily: Props["daily"];
  funnel: Props["funnel"];
  dropoff: Props["dropoff"];
  pageViews: Props["pageViews"];
  devices: Props["devices"];
  errors: Props["errors"];
  thisToThat: Props["thisToThat"];
}) {
  if (!summary || !funnel || !dropoff || !pageViews || !devices || !errors) {
    return <div className="card">Overview data is not available for this role.</div>;
  }

  const funnelSteps = [
    { label: "Homepage viewed", value: funnel.step1_homepage_viewed },
    {
      label: "Transcriber viewed",
      value: funnel.step2_transcriber_viewed,
      pct: pct(funnel.step1_homepage_viewed, funnel.step2_transcriber_viewed),
    },
    {
      label: "Transcription started",
      value: funnel.step3_transcription_started,
      pct: pct(funnel.step2_transcriber_viewed, funnel.step3_transcription_started),
    },
    {
      label: "Transcription completed",
      value: funnel.step4_transcription_completed,
      pct: pct(funnel.step3_transcription_started, funnel.step4_transcription_completed),
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
        <div className="page-header">
          <SectionHeader title="YouTube Downloader Tokens" />
          <p className="muted text-small">
            Latest ThisToThat snapshot
          </p>
        </div>
        {thisToThat ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card title="Remaining requests" value={thisToThat.remainingRequests ?? "-"} />
              <Card title="Quota limit" value={thisToThat.quotaLimit ?? "-"} />
              <Card
                title="Used"
                value={
                  thisToThat.quotaLimit !== null && thisToThat.remainingRequests !== null
                    ? Math.max(0, thisToThat.quotaLimit - thisToThat.remainingRequests)
                    : "-"
                }
              />
              <Card
                title="Configured"
                value={thisToThat.configured ? "Yes" : "No"}
              />
              <Card
                title="Last seen"
                value={thisToThat.observedAt ? new Date(thisToThat.observedAt).toLocaleString() : "-"}
              />
            </section>

            <div className="overflow-x-auto">
              <table className="table">
                <tbody>
                  <tr className="border-t border-slate-200">
                    <td className="px-2 py-1 text-slate-600">Provider</td>
                    <td className="px-2 py-1">{thisToThat.provider || "thistothat"}</td>
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td className="px-2 py-1 text-slate-600">Reset</td>
                    <td className="px-2 py-1">
                      {thisToThat.resetAt ? new Date(thisToThat.resetAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td className="px-2 py-1 text-slate-600">Observed from</td>
                    <td className="px-2 py-1">{thisToThat.source || "-"}</td>
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td className="px-2 py-1 text-slate-600">Field</td>
                    <td className="px-2 py-1">{thisToThat.fieldName || "-"}</td>
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td className="px-2 py-1 text-slate-600">Manual refresh cost</td>
                    <td className="px-2 py-1">
                      {thisToThat.refreshConsumesRequest ? "A manual refresh can use 1 request." : "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {thisToThat.refreshError ? (
              <div className="notice">
                Snapshot refresh error: {thisToThat.refreshError}
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted text-small">
            ThisToThat usage is not available right now.
          </p>
        )}
      </section>

      <section className="card stack">
        <SectionHeader title="Usage over time" />
        <TimeSeriesChart data={daily} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card stack">
          <SectionHeader title="Conversion funnel" />
          <FunnelBars steps={funnelSteps} />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs text-slate-300">
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
            <BarItem label="Left after homepage" value={dropoff.dropoffAfterHomepage} />
            <BarItem label="Viewed transcriber but did not start" value={dropoff.dropoffAfterTranscriberView} />
            <BarItem
              label="Started but never completed transcription"
              value={dropoff.dropoffAfterTranscriptionStart}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card stack">
          <div className="page-header">
            <SectionHeader title="Most viewed pages" />
            <p className="muted text-small">{pageViews.trackedSessions} tracked sessions</p>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="px-2 py-1">Path</th>
                  <th className="px-2 py-1">Page views</th>
                  <th className="px-2 py-1">Unique visitors</th>
                </tr>
              </thead>
              <tbody>
                {pageViews.topPages.map((row) => (
                  <tr key={`top-${row.path}`} className="border-t border-slate-200">
                    <td className="px-2 py-1">{row.path}</td>
                    <td className="px-2 py-1">{row.pageViews}</td>
                    <td className="px-2 py-1">{row.uniqueVisitors}</td>
                  </tr>
                ))}
                {pageViews.topPages.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                      No page views in range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card stack">
          <SectionHeader title="Common exit pages" />
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="px-2 py-1">Path</th>
                  <th className="px-2 py-1">Session exits</th>
                  <th className="px-2 py-1">Exit rate</th>
                </tr>
              </thead>
              <tbody>
                {pageViews.exitPages.map((row) => (
                  <tr key={`exit-${row.path}`} className="border-t border-slate-200">
                    <td className="px-2 py-1">{row.path}</td>
                    <td className="px-2 py-1">{row.exits}</td>
                    <td className="px-2 py-1">{row.exitRate.toFixed(1)}%</td>
                  </tr>
                ))}
                {pageViews.exitPages.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                      No exit pages in range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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

function EventsView({
  recentEvents,
  recentFeedback,
}: {
  recentEvents: Props["recentEvents"];
  recentFeedback: Props["recentFeedback"];
}) {
  return (
    <>
      <section className="card stack">
        <SectionHeader title="Recent feedback" />
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">User</th>
                <th className="px-2 py-1">Category</th>
                <th className="px-2 py-1">Message</th>
                <th className="px-2 py-1">Page</th>
              </tr>
            </thead>
            <tbody>
              {recentFeedback.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-200 align-top">
                  <td className="px-2 py-1 text-slate-600">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-1">{entry.userEmail || "-"}</td>
                  <td className="px-2 py-1">{entry.category}</td>
                  <td className="px-2 py-1">{entry.message || "-"}</td>
                  <td className="px-2 py-1">{entry.path || "-"}</td>
                </tr>
              ))}
              {recentFeedback.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                    No feedback submitted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
    </>
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

  let summary: Awaited<ReturnType<typeof getSummaryStats>> | null = null;
  let daily: DailyPoint[] = [];
  let funnel: Funnel | null = null;
  let dropoff: Dropoff | null = null;
  let pageViews: PageViews | null = null;
  let devices: Devices | null = null;
  let errors: Errors | null = null;
  let topUsers: TopUser[] = [];
  let recentEvents: RecentEvent[] = [];
  let recentFeedback: RecentFeedback[] = [];
  let usersActivity: Awaited<ReturnType<typeof getUsersActivity>> = [];
  let gteStats: GteStats | null = null;
  let parity: Parity | null = null;
  let moderation: ModerationSnapshot = {
    analytics: [],
    consents: [],
    stats: { totalEvents: 0, totalConsents: 0, eventsByType: {} },
  };
  let thisToThat: Props["thisToThat"] = null;

  if (isAdmin) {
    const sessionUser = session.user;
    const backendBaseUrl = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
    const backendSecret = process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
    const canFetchThisToThat = Boolean(sessionUser?.id);

    if (activeView === "overview") {
      [summary, daily, funnel, dropoff, pageViews, devices, errors, thisToThat] = await Promise.all([
        getSummaryStats(from, to),
        getDailyTimeSeries(from, to),
        getConversionFunnel(from, to),
        getDropoffPoints(from, to),
        getPageViewBreakdown(from, to, 10),
        getDeviceBreakdown(from, to),
        getErrorStats(from, to),
        canFetchThisToThat
          ? (async () => {
              try {
                const response = await fetch(`${backendBaseUrl.replace(/\/$/, "")}/api/v1/analytics/thistothat`, {
                  headers: {
                    "X-User-Id": sessionUser!.id,
                    ...(backendSecret ? { "x-backend-secret": backendSecret } : {}),
                  },
                });
                if (!response.ok) {
                  return null;
                }
                const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
                if (!payload || typeof payload !== "object") {
                  return null;
                }
                return {
                  provider: typeof payload.provider === "string" ? payload.provider : "thistothat",
                  configured: Boolean(payload.configured),
                  remainingRequests:
                    typeof payload.remainingRequests === "number" ? payload.remainingRequests : null,
                  quotaLimit: typeof payload.quotaLimit === "number" ? payload.quotaLimit : null,
                  resetAt: typeof payload.resetAt === "string" ? payload.resetAt : null,
                  observedAt: typeof payload.observedAt === "string" ? payload.observedAt : null,
                  source: typeof payload.source === "string" ? payload.source : null,
                  fieldName: typeof payload.fieldName === "string" ? payload.fieldName : null,
                  refreshConsumesRequest: Boolean(payload.refreshConsumesRequest),
                  refreshUsed: Boolean(payload.refreshUsed),
                  refreshError: typeof payload.refreshError === "string" ? payload.refreshError : null,
                };
              } catch {
                return null;
              }
            })()
          : Promise.resolve(null),
      ]);
    } else if (activeView === "gte") {
      gteStats = await getGteEditorStats(from, to, 25);
    } else if (activeView === "users") {
      [topUsers, usersActivity] = await Promise.all([
        getTopUsers(from, to, 10),
        getUsersActivity(from, to, 100),
      ]);
    } else if (activeView === "events") {
      [recentEvents, recentFeedback] = await Promise.all([
        getRecentEvents(from, to, 50),
        getRecentFeedback(from, to, 50),
      ]);
    } else if (activeView === "moderation") {
      moderation = await getModerationSnapshot(50);
    } else if (activeView === "parity" && parityEnabled) {
      const parityFrom = new Date();
      parityFrom.setDate(parityFrom.getDate() - 6);
      parity = await getParityMetrics(parityFrom, to);
    }
  } else if (activeView === "moderation") {
    moderation = await getModerationSnapshot(50);
  }

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
      pageViews,
      devices,
      errors,
      topUsers: topUsers.map((u) => ({
        ...u,
        lastActive: u.lastActive ? u.lastActive.toISOString() : null,
      })),
      recentEvents: recentEvents.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      recentFeedback: recentFeedback.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
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
      thisToThat,
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
