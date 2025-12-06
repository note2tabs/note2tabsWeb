import { prisma } from "./prisma";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

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
