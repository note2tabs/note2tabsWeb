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

type Props = {
  from: string;
  to: string;
  summary: Awaited<ReturnType<typeof getSummaryStats>>;
  daily: DailyPoint[];
  funnel: Funnel;
  dropoff: Dropoff;
  devices: Devices;
  errors: Errors;
  topUsers: TopUser[];
  recentEvents: RecentEvent[];
  usersActivity: Awaited<ReturnType<typeof getUsersActivity>>;
};

const presetRanges: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export default function AnalyticsDashboard({
  from,
  to,
  summary,
  daily,
  funnel,
  dropoff,
  devices,
  errors,
  topUsers,
  recentEvents,
  usersActivity,
}: Props) {
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
      <Head>
        <title>Analytics Dashboard - Note2Tabs</title>
      </Head>
      <main className="page">
        <div className="container stack">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Analytics Dashboard</h1>
              <p className="text-sm text-slate-600">Usage, conversion, and reliability metrics for Note2Tabs</p>
              <p className="text-xs text-slate-500">
                Range: {from} {"->"} {to}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {Object.entries(presetRanges).map(([key, days]) => (
                <Link
                  key={key}
                  href={`/admin/analytics?range=${key}`}
                  className="button-secondary button-small"
                >
                  Last {days}d
                </Link>
              ))}
            </div>
          </div>

          <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Card title="Visitors" value={summary.totalVisitors} />
            <Card title="Signups" value={summary.totalSignups} />
            <Card title="Active users" value={summary.totalActiveUsers} />
            <Card title="Transcriptions" value={summary.totalTranscriptions} />
            <Card title="Success rate" value={`${summary.successRate.toFixed(1)}%`} />
            <Card
              title="Avg transcriptions / user"
              value={summary.avgTranscriptionsPerUser.toFixed(2)}
            />
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
                      <td className="px-2 py-1 text-slate-600">
                        {u.lastActive ? new Date(u.lastActive).toLocaleString() : "-"}
                      </td>
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

          <section className="card stack">
            <SectionHeader title="All users & activity (last 100 accounts)" />
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="px-2 py-1">Email</th>
                    <th className="px-2 py-1">Role</th>
                    <th className="px-2 py-1">Signups</th>
                    <th className="px-2 py-1">Transcriptions</th>
                    <th className="px-2 py-1">Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {usersActivity.map((u) => (
                    <tr key={u.id} className="border-t border-slate-200">
                      <td className="px-2 py-1">{u.email}</td>
                      <td className="px-2 py-1">{u.role}</td>
                      <td className="px-2 py-1">{u.signupEvents}</td>
                      <td className="px-2 py-1">{u.totalTranscriptions}</td>
                      <td className="px-2 py-1 text-slate-600">
                        {u.lastActive ? new Date(u.lastActive).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                  {usersActivity.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                        No users yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
                <BarItem label="Started but never completed transcription" value={dropoff.dropoffAfterTranscriptionStart} />
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

            <div className="card stack">
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
                        <td className="px-2 py-1 text-slate-600">
                          {new Date(e.createdAt).toLocaleString()}
                        </td>
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
            </div>
          </section>
        </div>
      </main>
    </>
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
  return <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>;
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

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return {
      redirect: { destination: "/", permanent: false },
    };
  }

  const range = (ctx.query.range as string) || "30d";
  const days = presetRanges[range] || 30;
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));

  const [summary, daily, funnel, dropoff, devices, errors, topUsers, recentEvents, usersActivity] = await Promise.all([
    getSummaryStats(from, to),
    getDailyTimeSeries(from, to),
    getConversionFunnel(from, to),
    getDropoffPoints(from, to),
    getDeviceBreakdown(from, to),
    getErrorStats(from, to),
    getTopUsers(from, to, 10),
    getRecentEvents(from, to, 50),
    getUsersActivity(from, to, 100),
  ]);

  return {
    props: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
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
    },
  };
};
