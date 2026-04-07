import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      analyticsEvent: {
        findMany: vi.fn(),
      },
      analyticsEventV2: {
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
    readsEnabled: false,
    adminParityEnabled: true,
    parityThresholdPct: 5,
    fingerprintLinkDays: 30,
    rawRetentionDays: 180,
    rollupRetentionDays: 730,
    propsMaxBytes: 16 * 1024,
  },
}));

import { getErrorStats, getSummaryStats } from "../../lib/analyticsQueries";

describe("analytics queries in legacy read mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.analyticsEvent.findMany.mockResolvedValue([]);
    prismaMock.tabJob.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
  });

  it("normalizes legacy transcribe_* events so summary metrics are accurate", async () => {
    prismaMock.analyticsEvent.findMany.mockResolvedValue([
      {
        id: "1",
        event: "page_view",
        path: "/",
        referer: null,
        createdAt: new Date("2026-03-10T10:00:00.000Z"),
        userId: null,
        sessionId: "sess_1",
        browser: "Chrome",
        os: "macOS",
        deviceType: "desktop",
        payload: "{}",
      },
      {
        id: "2",
        event: "page_view",
        path: "/",
        referer: null,
        createdAt: new Date("2026-03-10T10:05:00.000Z"),
        userId: null,
        sessionId: "sess_2",
        browser: "Chrome",
        os: "macOS",
        deviceType: "desktop",
        payload: "{}",
      },
      {
        id: "3",
        event: "transcribe_start",
        path: "/transcriber",
        referer: null,
        createdAt: new Date("2026-03-10T10:06:00.000Z"),
        userId: null,
        sessionId: "sess_1",
        browser: "Chrome",
        os: "macOS",
        deviceType: "desktop",
        payload: "{}",
      },
      {
        id: "4",
        event: "transcribe_success",
        path: "/transcriber",
        referer: null,
        createdAt: new Date("2026-03-10T10:07:00.000Z"),
        userId: null,
        sessionId: "sess_1",
        browser: "Chrome",
        os: "macOS",
        deviceType: "desktop",
        payload: "{}",
      },
      {
        id: "5",
        event: "transcribe_error",
        path: "/transcriber",
        referer: null,
        createdAt: new Date("2026-03-10T10:08:00.000Z"),
        userId: null,
        sessionId: "sess_2",
        browser: "Chrome",
        os: "macOS",
        deviceType: "desktop",
        payload: JSON.stringify({ errorMessage: "failed" }),
      },
    ]);
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.tabJob.findMany.mockResolvedValue([{ userId: "user_1" }]);

    const from = new Date("2026-03-10T00:00:00.000Z");
    const to = new Date("2026-03-10T23:59:59.999Z");

    const summary = await getSummaryStats(from, to);
    expect(summary.totalVisitors).toBe(2);
    expect(summary.totalSignups).toBe(2);
    expect(summary.successRate).toBe(100);

    const errors = await getErrorStats(from, to);
    expect(errors.totalFailed).toBe(1);
    expect(errors.byType[0]).toMatchObject({ message: "failed", count: 1 });
  });
});
