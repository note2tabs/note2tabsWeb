import { prisma } from "./prisma";
import { analyticsFlags } from "./analyticsV2/flags";
import {
  CANONICAL_TO_LEGACY_EVENT_NAME,
  toCanonicalName,
  toLegacyName,
} from "./analyticsV2/canonical";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

type UnifiedAnalyticsEvent = {
  id: string;
  event: string;
  path: string | null;
  referer: string | null;
  createdAt: Date;
  userId: string | null;
  sessionId: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  payload: string | null;
};

const UNIFIED_EVENTS_CACHE_TTL_MS = 10_000;
const unifiedEventsCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<UnifiedAnalyticsEvent[]>;
  }
>();

function mapUnifiedEventName(name: string) {
  const canonical = toCanonicalName(name).name;
  return CANONICAL_TO_LEGACY_EVENT_NAME[canonical] || canonical;
}

function mapEventNameFromV2(name: string) {
  return mapUnifiedEventName(name);
}

async function getUnifiedEvents(from: Date, to: Date): Promise<UnifiedAnalyticsEvent[]> {
  const cacheKey = `${analyticsFlags.readsEnabled ? "v2" : "legacy"}:${from.toISOString()}:${to.toISOString()}`;
  const cached = unifiedEventsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const now = Date.now();
  for (const [key, entry] of unifiedEventsCache) {
    if (entry.expiresAt <= now) unifiedEventsCache.delete(key);
  }
  if (unifiedEventsCache.size > 20) unifiedEventsCache.clear();

  const promise = fetchUnifiedEvents(from, to);
  unifiedEventsCache.set(cacheKey, {
    expiresAt: now + UNIFIED_EVENTS_CACHE_TTL_MS,
    promise,
  });
  promise.catch(() => {
    unifiedEventsCache.delete(cacheKey);
  });
  return promise;
}

async function fetchUnifiedEvents(from: Date, to: Date): Promise<UnifiedAnalyticsEvent[]> {
  if (!analyticsFlags.readsEnabled) {
    return prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        event: true,
        path: true,
        referer: true,
        createdAt: true,
        userId: true,
        sessionId: true,
        browser: true,
        os: true,
        deviceType: true,
        payload: true,
      },
    }).then((rows) =>
      rows.map((row) => ({
        ...row,
        event: mapUnifiedEventName(row.event),
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      }))
    );
  }

  const rows = await prisma.analyticsEventV2.findMany({
    where: { ts: { gte: from, lte: to } },
    select: {
      id: true,
      name: true,
      legacyEventName: true,
      path: true,
      referrer: true,
      ts: true,
      accountId: true,
      anonId: true,
      sessionId: true,
      uaBrowser: true,
      uaOs: true,
      uaDevice: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      props: true,
    },
  });

  return rows.map((row) => {
    const props = row.props && typeof row.props === "object" ? (row.props as Record<string, unknown>) : {};
    const payloadPath = typeof props.path === "string" ? props.path : null;
    return {
      id: row.id.toString(),
      event: mapEventNameFromV2(row.name),
      path: row.path || payloadPath || null,
      referer: row.referrer || null,
      createdAt: row.ts,
      userId: row.accountId || null,
      sessionId: row.sessionId || row.anonId || null,
      browser: row.uaBrowser || null,
      os: row.uaOs || null,
      deviceType: row.uaDevice || null,
      utmSource: row.utmSource || (typeof props.utm_source === "string" ? props.utm_source : null),
      utmMedium: row.utmMedium || (typeof props.utm_medium === "string" ? props.utm_medium : null),
      utmCampaign: row.utmCampaign || (typeof props.utm_campaign === "string" ? props.utm_campaign : null),
      payload: row.props ? JSON.stringify(row.props) : null,
    };
  });
}

function parsePayload(payload?: string | null): Record<string, any> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function normalizePath(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  const [withoutQuery = ""] = trimmed.split("?");
  const [withoutHash = ""] = withoutQuery.split("#");
  if (!withoutHash) return null;
  return withoutHash.startsWith("/") ? withoutHash : `/${withoutHash}`;
}

function isHomepagePath(path: string | null | undefined) {
  return normalizePath(path) === "/";
}

function isTranscriberPath(path: string | null | undefined) {
  const normalized = normalizePath(path);
  return normalized === "/transcriber" || Boolean(normalized && normalized.startsWith("/transcriber/"));
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(((p / 100) * (sorted.length - 1)))));
  return sorted[idx];
}

export async function getSummaryStats(from: Date, to: Date) {
  const [events, tabJobs, totalSignups] = await Promise.all([
    getUnifiedEvents(from, to),
    prisma.tabJob.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { userId: true },
    }),
    prisma.user.count({
      where: { createdAt: { gte: from, lte: to } },
    }),
  ]);

  const visitorSessions = new Set(
    events.filter((e) => e.event === "page_view" && e.sessionId).map((e) => e.sessionId as string)
  );
  const totalVisitors = visitorSessions.size;

  const activeUsers = new Set(tabJobs.map((t) => t.userId).filter(Boolean) as string[]);
  const totalTranscriptions = tabJobs.length;

  const started = events.filter((e) => e.event === "transcription_started").length;
  const completed =
    events.filter((e) => e.event === "transcription_completed").length || totalTranscriptions;

  const successRate = started > 0 ? (completed / started) * 100 : completed > 0 ? 100 : 0;
  const avgTranscriptionsPerUser = activeUsers.size ? totalTranscriptions / activeUsers.size : 0;

  return {
    totalVisitors,
    totalSignups,
    totalActiveUsers: activeUsers.size,
    totalTranscriptions,
    successRate,
    avgTranscriptionsPerUser,
  };
}

export async function getDailyTimeSeries(from: Date, to: Date) {
  const [events, tabJobs, signups] = await Promise.all([
    getUnifiedEvents(from, to),
    prisma.tabJob.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true, userId: true },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
  ]);

  const days: Record<
    string,
    { visitors: Set<string>; signups: number; activeUsers: Set<string>; transcriptions: number }
  > = {};
  const cursor = new Date(from);
  while (cursor <= to) {
    days[dayKey(cursor)] = {
      visitors: new Set<string>(),
      signups: 0,
      activeUsers: new Set<string>(),
      transcriptions: 0,
    };
    cursor.setDate(cursor.getDate() + 1);
  }

  events.forEach((e) => {
    const key = dayKey(e.createdAt);
    if (!days[key]) return;
    if (e.event === "page_view" && e.sessionId) days[key].visitors.add(e.sessionId);
  });

  signups.forEach((signup) => {
    const key = dayKey(signup.createdAt);
    if (!days[key]) return;
    days[key].signups += 1;
  });

  tabJobs.forEach((t) => {
    const key = dayKey(t.createdAt);
    if (!days[key]) return;
    days[key].transcriptions += 1;
    if (t.userId) days[key].activeUsers.add(t.userId);
  });

  return Object.entries(days).map(([date, vals]) => ({
    date,
    visitors: vals.visitors.size,
    signups: vals.signups,
    activeUsers: vals.activeUsers.size,
    transcriptions: vals.transcriptions,
  }));
}

export async function getConversionFunnel(from: Date, to: Date) {
  const events = await getUnifiedEvents(from, to);

  const homepageViewed = new Set<string>();
  const transcriberViewed = new Set<string>();
  const transcriptionStarted = new Set<string>();
  const transcriptionCompleted = new Set<string>();

  events.forEach((e) => {
    const sid = e.sessionId || "";
    if (!sid) return;
    if (e.event === "page_view" && isHomepagePath(e.path)) homepageViewed.add(sid);
    if (e.event === "page_view" && isTranscriberPath(e.path)) transcriberViewed.add(sid);
    if (e.event === "transcription_started") transcriptionStarted.add(sid);
    if (e.event === "transcription_completed") transcriptionCompleted.add(sid);
  });

  const reachedTranscriber = new Set<string>([...transcriberViewed, ...transcriptionStarted]);

  return {
    step1_homepage_viewed: homepageViewed.size,
    step2_transcriber_viewed: reachedTranscriber.size,
    step3_transcription_started: transcriptionStarted.size,
    step4_transcription_completed: transcriptionCompleted.size,
  };
}

export async function getDropoffPoints(from: Date, to: Date) {
  const events = await getUnifiedEvents(from, to);

  const homepage = new Set<string>();
  const transcriberViewed = new Set<string>();
  const transcribeStarted = new Set<string>();
  const transcribeCompleted = new Set<string>();

  events.forEach((e) => {
    const sid = e.sessionId || "";
    if (!sid) return;
    if (e.event === "page_view" && isHomepagePath(e.path)) homepage.add(sid);
    if (e.event === "page_view" && isTranscriberPath(e.path)) transcriberViewed.add(sid);
    if (e.event === "transcription_started") transcribeStarted.add(sid);
    if (e.event === "transcription_completed") transcribeCompleted.add(sid);
  });

  let dropoffAfterHomepage = 0;
  homepage.forEach((sid) => {
    if (!transcriberViewed.has(sid) && !transcribeStarted.has(sid)) {
      dropoffAfterHomepage += 1;
    }
  });

  let dropoffAfterTranscriberView = 0;
  transcriberViewed.forEach((sid) => {
    if (!transcribeStarted.has(sid)) {
      dropoffAfterTranscriberView += 1;
    }
  });

  return {
    dropoffAfterHomepage,
    dropoffAfterTranscriberView,
    dropoffAfterTranscriptionStart: Math.max(transcribeStarted.size - transcribeCompleted.size, 0),
  };
}

export async function getPageViewBreakdown(from: Date, to: Date, limit = 10) {
  const events = (await getUnifiedEvents(from, to))
    .filter((event) => event.event === "page_view")
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const pathStats = new Map<
    string,
    {
      pageViews: number;
      uniqueSessions: Set<string>;
    }
  >();
  const sessionLastPath = new Map<string, string>();

  for (const event of events) {
    const path = normalizePath(event.path);
    if (!path) continue;

    const entry = pathStats.get(path) || { pageViews: 0, uniqueSessions: new Set<string>() };
    entry.pageViews += 1;
    if (event.sessionId) {
      entry.uniqueSessions.add(event.sessionId);
      sessionLastPath.set(event.sessionId, path);
    }
    pathStats.set(path, entry);
  }

  const exitCounts: Record<string, number> = {};
  sessionLastPath.forEach((path) => {
    exitCounts[path] = (exitCounts[path] || 0) + 1;
  });

  const rows = Array.from(pathStats.entries()).map(([path, values]) => {
    const exits = exitCounts[path] || 0;
    const uniqueVisitors = values.uniqueSessions.size;
    return {
      path,
      pageViews: values.pageViews,
      uniqueVisitors,
      exits,
      exitRate: uniqueVisitors > 0 ? Math.round((exits / uniqueVisitors) * 1000) / 10 : 0,
    };
  });

  const topPages = rows
    .slice()
    .sort((a, b) => b.pageViews - a.pageViews || b.uniqueVisitors - a.uniqueVisitors || a.path.localeCompare(b.path))
    .slice(0, limit);

  const exitPages = rows
    .filter((row) => row.exits > 0)
    .sort((a, b) => b.exits - a.exits || b.exitRate - a.exitRate || a.path.localeCompare(b.path))
    .slice(0, limit);

  return {
    topPages,
    exitPages,
    trackedSessions: sessionLastPath.size,
  };
}

export async function getDeviceBreakdown(from: Date, to: Date) {
  const events = await getUnifiedEvents(from, to);

  const deviceTypeCounts: Record<string, number> = {};
  const browserCounts: Record<string, number> = {};
  const osCounts: Record<string, number> = {};

  events.forEach((e) => {
    const dt = e.deviceType || "unknown";
    const br = e.browser || "unknown";
    const os = e.os || "unknown";
    deviceTypeCounts[dt] = (deviceTypeCounts[dt] || 0) + 1;
    browserCounts[br] = (browserCounts[br] || 0) + 1;
    osCounts[os] = (osCounts[os] || 0) + 1;
  });

  return { deviceTypeCounts, browserCounts, osCounts };
}

export async function getErrorStats(from: Date, to: Date) {
  const errorEventNames = new Set([
    "transcription_failed",
    "upload_storage_failed",
    "upload_validation_failed",
    "signup_failed",
  ]);
  const events = (await getUnifiedEvents(from, to))
    .filter((event) => errorEventNames.has(event.event) || event.event.endsWith("_failed"))
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const byMessage: Record<string, number> = {};
  const byEvent: Record<string, number> = {};
  const byPath: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  const byBrowser: Record<string, number> = {};
  const hourlyMap = new Map<string, number>();
  const recentErrors: Array<{
    id: string;
    occurredAt: string;
    event: string;
    message: string;
    path: string | null;
    mode: string | null;
    step: string | null;
    browser: string | null;
    deviceType: string | null;
    userId: string | null;
    sessionId: string | null;
    jobId: string | null;
  }> = [];

  events.forEach((e) => {
    const payload = parsePayload(e.payload);
    const msg =
      typeof payload.errorMessage === "string"
        ? payload.errorMessage
        : typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
        ? payload.error
        : e.payload && e.payload.trim().startsWith("{")
        ? "Unknown error"
        : e.payload || "Unknown error";
    const mode = typeof payload.mode === "string" ? payload.mode : null;
    const step = typeof payload.step === "string" ? payload.step : null;
    const jobId = typeof payload.jobId === "string" ? payload.jobId : null;
    const hour = `${e.createdAt.toISOString().slice(0, 13)}:00`;

    byMessage[msg] = (byMessage[msg] || 0) + 1;
    byEvent[e.event] = (byEvent[e.event] || 0) + 1;
    byPath[e.path || "unknown"] = (byPath[e.path || "unknown"] || 0) + 1;
    byMode[mode || "unknown"] = (byMode[mode || "unknown"] || 0) + 1;
    byBrowser[e.browser || "unknown"] = (byBrowser[e.browser || "unknown"] || 0) + 1;
    hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
    if (recentErrors.length < 40) {
      recentErrors.push({
        id: e.id,
        occurredAt: e.createdAt.toISOString(),
        event: e.event,
        message: msg,
        path: e.path || null,
        mode,
        step,
        browser: e.browser || null,
        deviceType: e.deviceType || null,
        userId: e.userId || null,
        sessionId: e.sessionId || null,
        jobId,
      });
    }
  });

  const totalFailed = events.length;
  const byType = Object.entries(byMessage)
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count);

  const last24hCutoff = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  const last24h = events.filter((event) => event.createdAt >= last24hCutoff).length;
  const previous24hCutoff = new Date(to.getTime() - 48 * 60 * 60 * 1000);
  const previous24h = events.filter((event) => event.createdAt >= previous24hCutoff && event.createdAt < last24hCutoff).length;
  const trendPct = previous24h > 0 ? Math.round(((last24h - previous24h) / previous24h) * 1000) / 10 : last24h > 0 ? 100 : 0;

  return {
    totalFailed,
    last24h,
    previous24h,
    trendPct,
    byType,
    byEvent: Object.entries(byEvent).map(([event, count]) => ({ event, count })).sort((a, b) => b.count - a.count),
    byPath: Object.entries(byPath).map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    byMode: Object.entries(byMode).map(([mode, count]) => ({ mode, count })).sort((a, b) => b.count - a.count),
    byBrowser: Object.entries(byBrowser).map(([browser, count]) => ({ browser, count })).sort((a, b) => b.count - a.count),
    hourly: Array.from(hourlyMap.entries()).map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour.localeCompare(b.hour)),
    recentErrors,
  };
}

export async function getTopUsers(from: Date, to: Date, limit = 10) {
  const grouped = await prisma.tabJob.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const userIds = grouped.map((g) => g.userId).filter(Boolean) as string[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, role: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  return grouped
    .map((g) => ({
      userId: g.userId,
      email: g.userId ? userMap[g.userId]?.email || "Unknown" : "Unknown",
      role: g.userId ? userMap[g.userId]?.role || "FREE" : "FREE",
      totalTranscriptions: g._count._all,
      lastActive: g._max.createdAt,
    }))
    .sort((a, b) => b.totalTranscriptions - a.totalTranscriptions)
    .slice(0, limit);
}

export async function getUsersActivity(from: Date, to: Date, limit = 100) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      email: true,
      role: true,
      tokensRemaining: true,
      createdAt: true,
    },
  });

  const userIds = users.map((u) => u.id);

  // Transcriptions in range
  const tabCountsRange = await prisma.tabJob.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: from, lte: to }, userId: { in: userIds } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const tabCountsAll = await prisma.tabJob.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const rangeMap = Object.fromEntries(
    tabCountsRange.map((t) => [
      t.userId,
      { transcriptions: t._count._all, lastActive: t._max.createdAt },
    ])
  );
  const allMap = Object.fromEntries(
    tabCountsAll.map((t) => [
      t.userId,
      { transcriptions: t._count._all, lastActive: t._max.createdAt },
    ])
  );

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    tokensRemaining: u.tokensRemaining,
    rangeTranscriptions: rangeMap[u.id]?.transcriptions || 0,
    totalTranscriptions: allMap[u.id]?.transcriptions || 0,
    lastActive: rangeMap[u.id]?.lastActive || allMap[u.id]?.lastActive || null,
    signupEvents: u.createdAt >= from && u.createdAt <= to ? 1 : 0,
  }));
}

export async function getRecentEvents(from: Date, to: Date, limit = 50) {
  const events = (await getUnifiedEvents(from, to))
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
  const userIds = events.map((e) => e.userId).filter(Boolean) as string[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const map = Object.fromEntries(users.map((u) => [u.id, u.email]));
  return events.map((e) => ({
    ...e,
    userEmail: e.userId ? map[e.userId] || null : null,
  }));
}

export async function getRecentFeedback(from: Date, to: Date, limit = 50) {
  const feedbackEvents = (await getUnifiedEvents(from, to))
    .filter((event) => event.event === "user_feedback_submitted")
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  const userIds = feedbackEvents.map((event) => event.userId).filter(Boolean) as string[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const userMap = Object.fromEntries(users.map((user) => [user.id, user.email]));

  return feedbackEvents.map((event) => {
    const payload = parsePayload(event.payload);
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.text === "string"
        ? payload.text
        : "";
    const category =
      typeof payload.category === "string" && payload.category.trim()
        ? payload.category.trim()
        : "general";
    return {
      id: event.id,
      createdAt: event.createdAt,
      userId: event.userId,
      userEmail: event.userId ? userMap[event.userId] || null : null,
      category,
      message,
      path: event.path || null,
    };
  });
}

export async function getGteEditorStats(from: Date, to: Date, topUsersLimit = 25) {
  const gteEvents = (await getUnifiedEvents(from, to))
    .filter((event) =>
      [
        "gte_editor_created",
        "gte_editor_visit",
        "gte_editor_session_start",
        "gte_editor_session_end",
      ].includes(event.event)
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const createdDailyMap: Record<string, number> = {};
  const visitedDailyMap: Record<string, number> = {};
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = dayKey(cursor);
    createdDailyMap[key] = 0;
    visitedDailyMap[key] = 0;
    cursor.setDate(cursor.getDate() + 1);
  }

  const createdPerUser = new Map<string, { count: number; lastAt: Date | null }>();
  const uniqueVisitUsers = new Set<string>();
  const uniqueVisitSessions = new Set<string>();
  const createdEvents: Array<{
    id: string;
    userId: string | null;
    createdAt: Date;
    path: string | null;
    editorId: string | null;
  }> = [];
  const sessionDurations: number[] = [];
  const sessionStarts = gteEvents.filter((e) => e.event === "gte_editor_session_start").length;
  const sessionEnds = gteEvents.filter((e) => e.event === "gte_editor_session_end").length;

  gteEvents.forEach((event) => {
    const key = dayKey(event.createdAt);
    const payload = parsePayload(event.payload);

    if (event.event === "gte_editor_created") {
      createdDailyMap[key] = (createdDailyMap[key] || 0) + 1;
      createdEvents.push({
        id: event.id,
        userId: event.userId || null,
        createdAt: event.createdAt,
        path: event.path || null,
        editorId: typeof payload.editorId === "string" ? payload.editorId : null,
      });
      if (event.userId) {
        const current = createdPerUser.get(event.userId) || { count: 0, lastAt: null };
        current.count += 1;
        current.lastAt = !current.lastAt || current.lastAt < event.createdAt ? event.createdAt : current.lastAt;
        createdPerUser.set(event.userId, current);
      }
    }

    if (event.event === "gte_editor_visit") {
      visitedDailyMap[key] = (visitedDailyMap[key] || 0) + 1;
      if (event.userId) uniqueVisitUsers.add(event.userId);
      if (event.sessionId) uniqueVisitSessions.add(event.sessionId);
    }

    if (event.event === "gte_editor_session_end") {
      const duration =
        typeof payload.durationSec === "number"
          ? payload.durationSec
          : Number(payload.durationSec || 0);
      if (Number.isFinite(duration) && duration >= 0) {
        sessionDurations.push(Math.round(duration));
      }
    }
  });

  const userIds = Array.from(createdPerUser.keys());
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, role: true },
      })
    : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const createdPerUserRows = userIds
    .map((userId) => {
      const counts = createdPerUser.get(userId);
      return {
        userId,
        email: userMap[userId]?.email || "Unknown",
        role: userMap[userId]?.role || "FREE",
        count: counts?.count || 0,
        lastCreatedAt: counts?.lastAt || null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, topUsersLimit);

  const createdDaily = Object.entries(createdDailyMap).map(([date, count]) => ({ date, count }));
  const visitedDaily = Object.entries(visitedDailyMap).map(([date, count]) => ({ date, count }));
  const avgDuration =
    sessionDurations.length > 0
      ? sessionDurations.reduce((sum, value) => sum + value, 0) / sessionDurations.length
      : 0;

  return {
    createdTotal: createdEvents.length,
    visitTotal: gteEvents.filter((e) => e.event === "gte_editor_visit").length,
    uniqueVisitUsers: uniqueVisitUsers.size,
    uniqueVisitSessions: uniqueVisitSessions.size,
    sessionStarts,
    sessionEnds,
    sessionsWithDuration: sessionDurations.length,
    avgSessionDurationSec: avgDuration,
    medianSessionDurationSec: percentile(sessionDurations, 50),
    p95SessionDurationSec: percentile(sessionDurations, 95),
    createdDaily,
    visitedDaily,
    createdPerUser: createdPerUserRows,
    recentCreated: createdEvents
      .slice()
      .reverse()
      .slice(0, 50)
      .map((item) => ({
        ...item,
        userEmail: item.userId ? userMap[item.userId]?.email || null : null,
      })),
  };
}

function increment(map: Map<string, number>, key: string | null | undefined, count = 1) {
  const normalized = key && key.trim() ? key.trim() : "Unknown";
  map.set(normalized, (map.get(normalized) || 0) + count);
}

function topRows(map: Map<string, number>, limit = 8) {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function classifyTrafficSource(event: UnifiedAnalyticsEvent) {
  if (event.utmSource) return event.utmMedium ? `${event.utmSource} / ${event.utmMedium}` : event.utmSource;
  const referer = event.referer || "";
  if (!referer) return "Direct / none";
  try {
    const host = new URL(referer).hostname.replace(/^www\./, "");
    if (/google|bing|duckduckgo|yahoo|yandex|baidu/i.test(host)) return `Organic search / ${host}`;
    if (/youtube|facebook|instagram|tiktok|reddit|x\.com|twitter|linkedin/i.test(host)) return `Social / ${host}`;
    if (/note2tabs/i.test(host)) return "Internal";
    return `Referral / ${host}`;
  } catch {
    return "Referral / unknown";
  }
}

export async function getGrowthInsights(from: Date, to: Date) {
  const [events, users] = await Promise.all([
    getUnifiedEvents(from, to),
    prisma.user.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { id: true, createdAt: true },
    }),
  ]);

  const sourceCounts = new Map<string, number>();
  const campaignCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const ctaCounts = new Map<string, number>();
  const performanceValues = new Map<string, number[]>();
  const landing = new Map<
    string,
    {
      sessions: Set<string>;
      signups: Set<string>;
      starts: Set<string>;
      successes: Set<string>;
      bounces: Set<string>;
    }
  >();
  const sessionPages = new Map<string, string[]>();
  const sessionFirstPage = new Map<string, string>();
  const sessionHasAction = new Set<string>();
  const returningSessions = new Set<string>();
  const allSessions = new Set<string>();
  const uploadSelected = new Set<string>();
  const uploadStarted = new Set<string>();
  const uploadSucceeded = new Set<string>();
  const uploadFailed = new Set<string>();
  const pricingViewed = new Set<string>();
  const pricingClicked = new Set<string>();
  const checkoutStarted = new Set<string>();
  const signupStarted = new Set<string>();
  const signupCompleted = new Set<string>();
  const tabStarted = new Set<string>();
  const tabSucceeded = new Set<string>();
  const tabFailed = new Set<string>();

  for (const event of events.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const sid = event.sessionId || "";
    const payload = parsePayload(event.payload);
    if (sid) {
      allSessions.add(sid);
      if (!sessionFirstPage.has(sid) && event.event === "page_view") {
        sessionFirstPage.set(sid, normalizePath(event.path) || "/");
      }
    }
    if (event.event === "page_view") {
      increment(sourceCounts, classifyTrafficSource(event));
      if (event.utmCampaign) increment(campaignCounts, event.utmCampaign);
      if (sid) {
        const path = normalizePath(event.path) || "/";
        sessionPages.set(sid, [...(sessionPages.get(sid) || []), path]);
      }
    }

    const geo = payload.geo && typeof payload.geo === "object" ? (payload.geo as Record<string, unknown>) : {};
    if (typeof geo.country === "string") increment(countryCounts, geo.country);
    if (event.event === "cta_clicked" && typeof payload.cta === "string") increment(ctaCounts, payload.cta);
    if (event.event === "web_vital" && typeof payload.metric === "string" && typeof payload.value === "number") {
      const values = performanceValues.get(payload.metric) || [];
      values.push(payload.value);
      performanceValues.set(payload.metric, values);
    }

    if (["transcription_started", "transcription_completed", "transcription_failed", "cta_clicked", "signup_completed"].includes(event.event) && sid) {
      sessionHasAction.add(sid);
    }
    if (event.event === "upload_selected" && sid) uploadSelected.add(sid);
    if (event.event === "transcription_started" && sid) {
      uploadStarted.add(sid);
      tabStarted.add(sid);
    }
    if (event.event === "transcription_completed" && sid) {
      uploadSucceeded.add(sid);
      tabSucceeded.add(sid);
    }
    if (event.event === "transcription_failed" && sid) {
      uploadFailed.add(sid);
      tabFailed.add(sid);
    }
    if (event.event === "pricing_viewed" && sid) pricingViewed.add(sid);
    if (event.event === "pricing_cta_clicked" && sid) pricingClicked.add(sid);
    if (event.event === "checkout_started" && sid) checkoutStarted.add(sid);
    if (event.event === "signup_started" && sid) signupStarted.add(sid);
    if (event.event === "signup_completed" && sid) signupCompleted.add(sid);
  }

  for (const [sid, pages] of sessionPages) {
    if (pages.length > 1) returningSessions.add(sid);
    const firstPath = sessionFirstPage.get(sid) || pages[0] || "/";
    const row =
      landing.get(firstPath) ||
      { sessions: new Set<string>(), signups: new Set<string>(), starts: new Set<string>(), successes: new Set<string>(), bounces: new Set<string>() };
    row.sessions.add(sid);
    if (pages.length <= 1 && !sessionHasAction.has(sid)) row.bounces.add(sid);
    landing.set(firstPath, row);
  }

  for (const event of events) {
    const sid = event.sessionId || "";
    if (!sid) continue;
    const firstPath = sessionFirstPage.get(sid);
    if (!firstPath) continue;
    const row = landing.get(firstPath);
    if (!row) continue;
    if (event.event === "signup_completed") row.signups.add(sid);
    if (event.event === "transcription_started") row.starts.add(sid);
    if (event.event === "transcription_completed") row.successes.add(sid);
  }

  const performance = Array.from(performanceValues.entries()).map(([metric, values]) => ({
    metric,
    samples: values.length,
    median: percentile(values, 50),
    p75: percentile(values, 75),
    p95: percentile(values, 95),
  }));

  const landingPages = Array.from(landing.entries())
    .map(([path, row]) => ({
      path,
      sessions: row.sessions.size,
      bounceRate: row.sessions.size ? Math.round((row.bounces.size / row.sessions.size) * 1000) / 10 : 0,
      signupRate: row.sessions.size ? Math.round((row.signups.size / row.sessions.size) * 1000) / 10 : 0,
      transcriptionStartRate: row.sessions.size ? Math.round((row.starts.size / row.sessions.size) * 1000) / 10 : 0,
      transcriptionSuccessRate: row.starts.size ? Math.round((row.successes.size / row.starts.size) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  const newUserIds = new Set(users.map((user) => user.id));
  const returningAccountEvents = new Set(
    events
      .filter((event) => event.userId && !newUserIds.has(event.userId))
      .map((event) => event.userId as string)
  );

  const recommendations: string[] = [];
  const worstLanding = landingPages.slice().sort((a, b) => b.sessions - a.sessions || b.bounceRate - a.bounceRate)[0];
  if (worstLanding && worstLanding.sessions >= 5 && worstLanding.bounceRate >= 70) {
    recommendations.push(`${worstLanding.path} has a ${worstLanding.bounceRate}% bounce rate. Review above-the-fold copy and primary CTA clarity.`);
  }
  const failedRate = tabStarted.size ? Math.round((tabFailed.size / tabStarted.size) * 1000) / 10 : 0;
  if (failedRate >= 10) {
    recommendations.push(`Tab generation failure is ${failedRate}%. Check recent transcription errors and upload/storage failures.`);
  }
  if (pricingViewed.size >= 5 && checkoutStarted.size === 0) {
    recommendations.push("Pricing is getting views but no checkout starts. Test clearer premium CTA placement or plan comparison.");
  }

  return {
    trafficSources: topRows(sourceCounts),
    campaigns: topRows(campaignCounts),
    countries: topRows(countryCounts),
    ctaClicks: topRows(ctaCounts),
    landingPages,
    uploadFunnel: {
      selected: uploadSelected.size,
      started: uploadStarted.size,
      succeeded: uploadSucceeded.size,
      failed: uploadFailed.size,
    },
    tabGeneration: {
      started: tabStarted.size,
      succeeded: tabSucceeded.size,
      failed: tabFailed.size,
      successRate: tabStarted.size ? Math.round((tabSucceeded.size / tabStarted.size) * 1000) / 10 : 0,
    },
    signupConversion: {
      started: signupStarted.size,
      completed: signupCompleted.size || users.length,
      rate: signupStarted.size ? Math.round(((signupCompleted.size || users.length) / signupStarted.size) * 1000) / 10 : 0,
    },
    pricing: {
      viewed: pricingViewed.size,
      clicked: pricingClicked.size,
      checkoutStarted: checkoutStarted.size,
      clickRate: pricingViewed.size ? Math.round((pricingClicked.size / pricingViewed.size) * 1000) / 10 : 0,
    },
    retention: {
      sessions: allSessions.size,
      multiPageSessions: returningSessions.size,
      multiPageRate: allSessions.size ? Math.round((returningSessions.size / allSessions.size) * 1000) / 10 : 0,
      returningAccounts: returningAccountEvents.size,
    },
    performance,
    seo: {
      organicSessions: topRows(sourceCounts).filter((row) => row.label.startsWith("Organic search")).reduce((sum, row) => sum + row.count, 0),
      topOrganicSources: topRows(sourceCounts).filter((row) => row.label.startsWith("Organic search")),
    },
    recommendations,
  };
}

type ParityRow = {
  oldValue: number;
  v2Value: number;
  diffPct: number;
  flagged: boolean;
};

function buildParityRow(oldValue: number, v2Value: number, threshold: number): ParityRow {
  const denominator = Math.max(oldValue, v2Value, 1);
  const diffPct = Math.round((Math.abs(v2Value - oldValue) / denominator) * 10000) / 100;
  const minimumVolume = 20;
  const flagged = denominator >= minimumVolume && diffPct > threshold;
  return { oldValue, v2Value, diffPct, flagged };
}

export async function getParityMetrics(from: Date, to: Date) {
  const threshold = Math.max(1, analyticsFlags.parityThresholdPct);
  const [oldEvents, v2Events, gteV2Sessions] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { event: true, sessionId: true, payload: true },
    }),
    prisma.analyticsEventV2.findMany({
      where: { ts: { gte: from, lte: to } },
      select: { name: true, anonId: true, sessionId: true },
    }),
    prisma.analyticsGteSession.findMany({
      where: { startedAt: { gte: from, lte: to } },
      select: { durationMs: true },
    }),
  ]);

  const oldVisitors = new Set(
    oldEvents
      .filter((event) => event.event === "page_view" && event.sessionId)
      .map((event) => event.sessionId as string)
  ).size;
  const v2Visitors = new Set(
    v2Events
      .filter((event) => event.name === "page_viewed")
      .map((event) => event.anonId || event.sessionId)
      .filter(Boolean) as string[]
  ).size;

  const oldPageviews = oldEvents.filter((event) => event.event === "page_view").length;
  const v2Pageviews = v2Events.filter((event) => event.name === "page_viewed").length;

  const oldTranscriptionStarted = oldEvents.filter((event) => event.event === "transcription_started").length;
  const v2TranscriptionStarted = v2Events.filter((event) => event.name === "transcription_started").length;

  const oldTranscriptionSucceeded = oldEvents.filter((event) => event.event === "transcription_completed").length;
  const v2TranscriptionSucceeded = v2Events.filter((event) => event.name === "transcription_succeeded").length;

  const oldTranscriptionFailed = oldEvents.filter((event) => event.event === "transcription_failed").length;
  const v2TranscriptionFailed = v2Events.filter((event) => event.name === "transcription_failed").length;

  const oldGteSessionEndEvents = oldEvents.filter((event) => event.event === "gte_editor_session_end");
  const oldGteSessionsCount = oldGteSessionEndEvents.length;
  const oldGteDurationMs = oldGteSessionEndEvents.reduce((sum, event) => {
    if (!event.payload) return sum;
    try {
      const parsed = JSON.parse(event.payload);
      const durationSec =
        typeof parsed.durationSec === "number" ? parsed.durationSec : Number(parsed.durationSec || 0);
      if (!Number.isFinite(durationSec)) return sum;
      return sum + Math.max(0, Math.round(durationSec * 1000));
    } catch {
      return sum;
    }
  }, 0);

  const v2GteSessionsCount = gteV2Sessions.length;
  const v2GteDurationMs = gteV2Sessions.reduce((sum, row) => sum + Math.max(0, row.durationMs || 0), 0);

  return {
    threshold,
    visitors: buildParityRow(oldVisitors, v2Visitors, threshold),
    pageviews: buildParityRow(oldPageviews, v2Pageviews, threshold),
    transcriptionStarted: buildParityRow(oldTranscriptionStarted, v2TranscriptionStarted, threshold),
    transcriptionSucceeded: buildParityRow(oldTranscriptionSucceeded, v2TranscriptionSucceeded, threshold),
    transcriptionFailed: buildParityRow(oldTranscriptionFailed, v2TranscriptionFailed, threshold),
    gteSessionsCount: buildParityRow(oldGteSessionsCount, v2GteSessionsCount, threshold),
    gteSessionsDurationMs: buildParityRow(oldGteDurationMs, v2GteDurationMs, threshold),
  };
}

export async function getModerationSnapshot(limit = 50) {
  const analytics = analyticsFlags.readsEnabled
    ? (
        await prisma.analyticsEventV2.findMany({
          orderBy: { ts: "desc" },
          take: limit,
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
        take: limit,
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

  const consents = analyticsFlags.readsEnabled
    ? (
        await prisma.analyticsConsentSubject.findMany({
          orderBy: { updatedAt: "desc" },
          take: limit,
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
        take: limit,
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
    analytics,
    consents,
    stats: {
      totalEvents: analytics.length,
      totalConsents: consents.length,
      eventsByType,
    },
  };
}
