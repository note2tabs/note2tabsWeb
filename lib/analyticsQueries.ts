import { prisma } from "./prisma";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function parsePayload(payload?: string | null): Record<string, any> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(((p / 100) * (sorted.length - 1)))));
  return sorted[idx];
}

export async function getSummaryStats(from: Date, to: Date) {
  const events = await prisma.analyticsEvent.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { event: true, sessionId: true, userId: true },
  });
  const tabJobs = await prisma.tabJob.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { userId: true },
  });

  const visitorSessions = new Set(
    events.filter((e) => e.event === "page_view" && e.sessionId).map((e) => e.sessionId as string)
  );
  const totalVisitors = visitorSessions.size;
  const totalSignups = events.filter((e) => e.event === "signup_success").length;

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
  const events = await prisma.analyticsEvent.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { event: true, createdAt: true, sessionId: true, userId: true },
  });
  const tabJobs = await prisma.tabJob.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { createdAt: true, userId: true },
  });

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
    if (e.event === "signup_success") days[key].signups += 1;
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
  const events = await prisma.analyticsEvent.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { event: true, path: true, sessionId: true, userId: true },
  });
  const tabJobs = await prisma.tabJob.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { userId: true },
  });

  const step1 = new Set<string>();
  const step2 = new Set<string>();
  const step3 = new Set<string>();
  const step4 = new Set<string>();
  const step5 = new Set<string>();

  events.forEach((e) => {
    const sid = e.sessionId || "";
    if (!sid) return;
    if (e.event === "page_view" && e.path === "/") step1.add(sid);
    if (e.event === "cta_signup") step2.add(sid);
    if (e.event === "signup_opened") step3.add(sid);
    if (e.event === "signup_success") step4.add(sid);
  });

  tabJobs.forEach((t) => {
    if (t.userId) step5.add(t.userId);
  });

  return {
    step1_visitors: step1.size,
    step2_signup_cta_clicked: step2.size,
    step3_signup_opened: step3.size,
    step4_signup_success: step4.size,
    step5_first_transcription: step5.size,
  };
}

export async function getDropoffPoints(from: Date, to: Date) {
  const events = await prisma.analyticsEvent.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { event: true, path: true, sessionId: true },
  });

  const homepage = new Set<string>();
  const signupOpened = new Set<string>();
  const signupCompleted = new Set<string>();
  const transcribeStarted = new Set<string>();
  const transcribeCompleted = new Set<string>();

  events.forEach((e) => {
    const sid = e.sessionId || "";
    if (!sid) return;
    if (e.event === "page_view" && e.path === "/") homepage.add(sid);
    if (e.event === "signup_opened") signupOpened.add(sid);
    if (e.event === "signup_success") signupCompleted.add(sid);
    if (e.event === "transcription_started") transcribeStarted.add(sid);
    if (e.event === "transcription_completed") transcribeCompleted.add(sid);
  });

  return {
    dropoffAfterHomepage: Math.max(homepage.size - signupOpened.size, 0),
    dropoffAfterSignupOpen: Math.max(signupOpened.size - signupCompleted.size, 0),
    dropoffAfterTranscriptionStart: Math.max(transcribeStarted.size - transcribeCompleted.size, 0),
  };
}

export async function getDeviceBreakdown(from: Date, to: Date) {
  const events = await prisma.analyticsEvent.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { deviceType: true, browser: true, os: true },
  });

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
  const events = await prisma.analyticsEvent.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      event: "transcription_failed",
    },
    select: { payload: true },
  });
  const byMessage: Record<string, number> = {};
  events.forEach((e) => {
    let msg = "Unknown error";
    if (e.payload) {
      try {
        const parsed = JSON.parse(e.payload);
        msg = parsed?.errorMessage || parsed?.message || msg;
      } catch {
        msg = e.payload;
      }
    }
    byMessage[msg] = (byMessage[msg] || 0) + 1;
  });
  const totalFailed = events.length;
  const byType = Object.entries(byMessage)
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count);

  return { totalFailed, byType };
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

  const signupCounts = await prisma.analyticsEvent.groupBy({
    by: ["userId"],
    where: {
      createdAt: { gte: from, lte: to },
      event: "signup_success",
      userId: { in: userIds },
    },
    _count: { _all: true },
  });
  const signupMap = Object.fromEntries(signupCounts.map((s) => [s.userId, s._count._all]));

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    tokensRemaining: u.tokensRemaining,
    rangeTranscriptions: rangeMap[u.id]?.transcriptions || 0,
    totalTranscriptions: allMap[u.id]?.transcriptions || 0,
    lastActive: rangeMap[u.id]?.lastActive || allMap[u.id]?.lastActive || null,
    signupEvents: signupMap[u.id] || 0,
  }));
}

export async function getRecentEvents(from: Date, to: Date, limit = 50) {
  const events = await prisma.analyticsEvent.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      event: true,
      path: true,
      referer: true,
      createdAt: true,
      userId: true,
      sessionId: true,
    },
  });
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

export async function getGteEditorStats(from: Date, to: Date, topUsersLimit = 25) {
  const gteEvents = await prisma.analyticsEvent.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      event: {
        in: [
          "gte_editor_created",
          "gte_editor_visit",
          "gte_editor_session_start",
          "gte_editor_session_end",
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      event: true,
      userId: true,
      sessionId: true,
      payload: true,
      path: true,
      createdAt: true,
    },
  });

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
