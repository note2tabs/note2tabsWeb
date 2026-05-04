import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      analyticsEventV2: {
        findMany: vi.fn(),
      },
      analyticsEvent: {
        findMany: vi.fn(),
      },
      tabJob: {
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
      user: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      analyticsGteSession: {
        findMany: vi.fn(),
      },
      analyticsConsentSubject: {
        findMany: vi.fn(),
      },
      userConsent: {
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock("../../lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../../lib/analyticsV2/flags", () => ({
  analyticsFlags: {
    dualWrite: true,
    readsEnabled: true,
    adminParityEnabled: true,
    parityThresholdPct: 5,
    fingerprintLinkDays: 30,
    rawRetentionDays: 180,
    rollupRetentionDays: 730,
    propsMaxBytes: 16 * 1024,
  },
}));

import {
  getConversionFunnel,
  getDailyTimeSeries,
  getDropoffPoints,
  getErrorStats,
  getPageViewBreakdown,
  getSummaryStats,
} from "../../lib/analyticsQueries";

let idCounter = 1;

function v2Event(input: {
  name: string;
  ts: string;
  path?: string | null;
  sessionId?: string | null;
  anonId?: string | null;
  accountId?: string | null;
  props?: Record<string, unknown>;
}) {
  return {
    id: BigInt(idCounter++),
    name: input.name,
    legacyEventName: null,
    path: input.path ?? null,
    referrer: null,
    ts: new Date(input.ts),
    accountId: input.accountId ?? null,
    anonId: input.anonId ?? null,
    sessionId: input.sessionId ?? null,
    uaBrowser: "Chrome",
    uaOs: "macOS",
    uaDevice: "desktop",
    props: input.props ?? {},
  };
}

describe("analytics queries", () => {
  beforeEach(() => {
    idCounter = 1;
    vi.clearAllMocks();
    prismaMock.analyticsEventV2.findMany.mockResolvedValue([]);
    prismaMock.tabJob.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  it("computes summary stats from tracked visitors, users, and transcriptions", async () => {
    prismaMock.analyticsEventV2.findMany.mockResolvedValue([
      v2Event({ name: "page_viewed", ts: "2026-03-01T10:00:00.000Z", path: "/", sessionId: "sess_1" }),
      v2Event({ name: "page_viewed", ts: "2026-03-01T10:05:00.000Z", path: "/", anonId: "anon_2" }),
      v2Event({
        name: "transcription_started",
        ts: "2026-03-01T10:10:00.000Z",
        path: "/transcriber",
        sessionId: "sess_1",
      }),
      v2Event({
        name: "transcription_started",
        ts: "2026-03-01T10:11:00.000Z",
        path: "/transcriber",
        sessionId: "sess_3",
      }),
      v2Event({
        name: "transcription_succeeded",
        ts: "2026-03-01T10:12:00.000Z",
        path: "/transcriber",
        sessionId: "sess_1",
      }),
    ]);
    prismaMock.tabJob.findMany.mockResolvedValue([{ userId: "user_1" }, { userId: "user_1" }]);
    prismaMock.user.count.mockResolvedValue(3);

    const summary = await getSummaryStats(
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-03-02T00:00:00.000Z")
    );

    expect(summary.totalVisitors).toBe(2);
    expect(summary.totalSignups).toBe(3);
    expect(summary.totalActiveUsers).toBe(1);
    expect(summary.totalTranscriptions).toBe(2);
    expect(summary.successRate).toBeCloseTo(50);
    expect(summary.avgTranscriptionsPerUser).toBe(2);
  });

  it("builds daily series with signup counts from user creation", async () => {
    prismaMock.analyticsEventV2.findMany.mockResolvedValue([
      v2Event({ name: "page_viewed", ts: "2026-03-01T09:00:00.000Z", path: "/", sessionId: "sess_1" }),
      v2Event({ name: "page_viewed", ts: "2026-03-01T09:30:00.000Z", path: "/", sessionId: "sess_1" }),
      v2Event({ name: "page_viewed", ts: "2026-03-02T09:00:00.000Z", path: "/", sessionId: "sess_2" }),
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { createdAt: new Date("2026-03-02T12:00:00.000Z") },
      { createdAt: new Date("2026-03-03T12:00:00.000Z") },
    ]);
    prismaMock.tabJob.findMany.mockResolvedValue([
      { createdAt: new Date("2026-03-01T13:00:00.000Z"), userId: "user_1" },
      { createdAt: new Date("2026-03-02T13:00:00.000Z"), userId: "user_2" },
    ]);

    const daily = await getDailyTimeSeries(
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-03-03T23:59:59.999Z")
    );

    expect(daily).toEqual([
      { date: "2026-03-01", visitors: 1, signups: 0, activeUsers: 1, transcriptions: 1 },
      { date: "2026-03-02", visitors: 1, signups: 1, activeUsers: 1, transcriptions: 1 },
      { date: "2026-03-03", visitors: 0, signups: 1, activeUsers: 0, transcriptions: 0 },
    ]);
  });

  it("computes funnel and dropoff from actual homepage, transcriber, and transcription events", async () => {
    prismaMock.analyticsEventV2.findMany.mockResolvedValue([
      v2Event({ name: "page_viewed", ts: "2026-03-05T10:00:00.000Z", path: "/", sessionId: "sess_1" }),
      v2Event({
        name: "page_viewed",
        ts: "2026-03-05T10:01:00.000Z",
        path: "/transcriber",
        sessionId: "sess_1",
      }),
      v2Event({
        name: "transcription_started",
        ts: "2026-03-05T10:02:00.000Z",
        path: "/transcriber",
        sessionId: "sess_1",
      }),
      v2Event({
        name: "transcription_succeeded",
        ts: "2026-03-05T10:03:00.000Z",
        path: "/transcriber",
        sessionId: "sess_1",
      }),
      v2Event({ name: "page_viewed", ts: "2026-03-05T11:00:00.000Z", path: "/", sessionId: "sess_2" }),
      v2Event({ name: "page_viewed", ts: "2026-03-05T12:00:00.000Z", path: "/", sessionId: "sess_3" }),
      v2Event({
        name: "page_viewed",
        ts: "2026-03-05T12:01:00.000Z",
        path: "/transcriber",
        sessionId: "sess_3",
      }),
      v2Event({
        name: "transcription_started",
        ts: "2026-03-05T12:05:00.000Z",
        path: "/transcriber",
        sessionId: "sess_4",
      }),
    ]);

    const from = new Date("2026-03-05T00:00:00.000Z");
    const to = new Date("2026-03-05T23:59:59.999Z");

    const funnel = await getConversionFunnel(from, to);
    expect(funnel).toEqual({
      step1_homepage_viewed: 3,
      step2_transcriber_viewed: 3,
      step3_transcription_started: 2,
      step4_transcription_completed: 1,
    });

    const dropoff = await getDropoffPoints(from, to);
    expect(dropoff).toEqual({
      dropoffAfterHomepage: 1,
      dropoffAfterTranscriberView: 1,
      dropoffAfterTranscriptionStart: 1,
    });
  });

  it("reports top viewed pages and exit pages, including payload path fallback", async () => {
    prismaMock.analyticsEventV2.findMany.mockResolvedValue([
      v2Event({ name: "page_viewed", ts: "2026-03-07T09:00:00.000Z", path: "/", sessionId: "sess_1" }),
      v2Event({
        name: "page_viewed",
        ts: "2026-03-07T09:01:00.000Z",
        path: "/transcriber?mode=file#step",
        sessionId: "sess_1",
      }),
      v2Event({ name: "page_viewed", ts: "2026-03-07T09:02:00.000Z", path: "/tabs/1", sessionId: "sess_1" }),
      v2Event({ name: "page_viewed", ts: "2026-03-07T09:10:00.000Z", path: "/", sessionId: "sess_2" }),
      v2Event({ name: "page_viewed", ts: "2026-03-07T09:20:00.000Z", path: "/pricing", sessionId: "sess_3" }),
      v2Event({
        name: "page_viewed",
        ts: "2026-03-07T09:30:00.000Z",
        path: null,
        sessionId: "sess_4",
        props: { path: "/auth/signup" },
      }),
      v2Event({
        name: "transcription_started",
        ts: "2026-03-07T09:35:00.000Z",
        path: "/transcriber",
        sessionId: "sess_4",
      }),
    ]);

    const result = await getPageViewBreakdown(
      new Date("2026-03-07T00:00:00.000Z"),
      new Date("2026-03-07T23:59:59.999Z"),
      10
    );

    expect(result.trackedSessions).toBe(4);

    const homepage = result.topPages.find((row) => row.path === "/");
    expect(homepage).toBeDefined();
    expect(homepage).toMatchObject({
      pageViews: 2,
      uniqueVisitors: 2,
      exits: 1,
      exitRate: 50,
    });

    const transcriber = result.topPages.find((row) => row.path === "/transcriber");
    expect(transcriber).toBeDefined();
    expect(transcriber?.pageViews).toBe(1);

    const exitMap = Object.fromEntries(result.exitPages.map((row) => [row.path, row.exits]));
    expect(exitMap["/"]).toBe(1);
    expect(exitMap["/tabs/1"]).toBe(1);
    expect(exitMap["/pricing"]).toBe(1);
    expect(exitMap["/auth/signup"]).toBe(1);
  });

  it("uses validation failure reasons as readable error messages", async () => {
    prismaMock.analyticsEventV2.findMany.mockResolvedValue([
      v2Event({
        name: "upload_validation_failed",
        ts: "2026-03-08T09:00:00.000Z",
        path: "/",
        sessionId: "sess_1",
        props: { reason: "invalid_youtube_url", mode: "YOUTUBE" },
      }),
      v2Event({
        name: "upload_validation_failed",
        ts: "2026-03-08T09:01:00.000Z",
        path: "/",
        sessionId: "sess_2",
        props: { reason: "file_too_large", mode: "FILE" },
      }),
    ]);

    const errors = await getErrorStats(
      new Date("2026-03-08T00:00:00.000Z"),
      new Date("2026-03-08T23:59:59.999Z")
    );

    expect(errors.recentErrors.map((error) => error.message)).toEqual([
      "Validation failed: File too large",
      "Validation failed: Invalid YouTube URL",
    ]);
    expect(errors.byType).toEqual([
      { message: "Validation failed: File too large", count: 1 },
      { message: "Validation failed: Invalid YouTube URL", count: 1 },
    ]);
  });
});
