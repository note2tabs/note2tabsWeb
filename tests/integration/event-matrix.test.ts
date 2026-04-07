import { describe, expect, it, vi } from "vitest";
import { ingestAnalyticsEvents } from "../../lib/analyticsV2/ingest";

type GteSessionRow = {
  gteSessionId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
};

function createPrismaMock() {
  const seenEventIds = new Set<string>();
  const createdV2: Array<{ name: string; legacyEventName: string | null }> = [];
  const createdLegacyEvents: string[] = [];
  const gteSessions = new Map<string, GteSessionRow>();

  const analyticsEventV2Create = vi.fn(async ({ data }: { data: { eventId: string; name: string; legacyEventName?: string | null } }) => {
    if (seenEventIds.has(data.eventId)) {
      throw { code: "P2002" };
    }
    seenEventIds.add(data.eventId);
    createdV2.push({
      name: data.name,
      legacyEventName: data.legacyEventName ?? null,
    });
    return { id: BigInt(seenEventIds.size), ...data };
  });

  const prismaMock = {
    analyticsEventV2: {
      create: analyticsEventV2Create,
    },
    analyticsEvent: {
      create: vi.fn(async ({ data }: { data: { event: string } }) => {
        createdLegacyEvents.push(data.event);
        return data;
      }),
    },
    analyticsConsentSubject: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: any }) => ({ id: BigInt(1), ...data })),
      update: vi.fn(async ({ data }: { data: any }) => ({ id: BigInt(1), ...data })),
    },
    analyticsGteSession: {
      upsert: vi.fn(async ({ where, create }: { where: { gteSessionId: string }; create: any }) => {
        const id = where.gteSessionId;
        const existing = gteSessions.get(id);
        if (!existing) {
          gteSessions.set(id, {
            gteSessionId: id,
            startedAt: create.startedAt,
            endedAt: create.endedAt ?? null,
            durationMs: create.durationMs ?? null,
          });
        }
        return gteSessions.get(id);
      }),
      findUnique: vi.fn(async ({ where }: { where: { gteSessionId: string } }) => {
        return gteSessions.get(where.gteSessionId) || null;
      }),
      update: vi.fn(async ({ where, data }: { where: { gteSessionId: string }; data: any }) => {
        const current = gteSessions.get(where.gteSessionId);
        if (!current) return null;
        const next = {
          ...current,
          endedAt: data.endedAt ?? current.endedAt,
          durationMs: data.durationMs ?? current.durationMs,
        };
        gteSessions.set(where.gteSessionId, next);
        return next;
      }),
    },
  } as any;

  return { prismaMock, createdV2, createdLegacyEvents };
}

describe("analytics event matrix", () => {
  it("ingests every legacy event emitted by the app", async () => {
    const { prismaMock, createdV2, createdLegacyEvents } = createPrismaMock();

    const result = await ingestAnalyticsEvents({
      prismaClient: prismaMock,
      accountId: "user_1",
      cookies: { analytics_consent: "granted", analytics_anon: "anon_legacy", analytics_session: "sess_legacy" },
      body: {
        events: [
          { event: "page_view", path: "/" },
          { event: "transcribe_start", path: "/transcriber", payload: { mode: "FILE" } },
          { event: "transcribe_queued", path: "/transcriber", payload: { jobId: "job_1" } },
          { event: "transcribe_success", path: "/transcriber", payload: { jobId: "job_1" } },
          { event: "transcribe_error", path: "/transcriber", payload: { errorMessage: "boom" } },
          { event: "gte_editor_created", path: "/api/gte/editors", payload: { editorId: "ed_1" } },
          { event: "gte_editor_visit", path: "/gte/ed_1", sessionId: "sess_gte", payload: { editorId: "ed_1" } },
          {
            event: "gte_editor_session_start",
            path: "/gte/ed_1",
            sessionId: "sess_gte",
            payload: { editorId: "ed_1", sessionId: "sess_gte" },
          },
          {
            event: "gte_editor_session_end",
            path: "/gte/ed_1",
            sessionId: "sess_gte",
            payload: { editorId: "ed_1", sessionId: "sess_gte", durationSec: 42 },
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.received).toBe(9);
    expect(result.written).toBe(9);
    expect(result.dualWritten).toBe(9);

    expect(createdV2.map((row) => row.name)).toEqual([
      "page_viewed",
      "transcription_started",
      "transcribe_queued",
      "transcription_succeeded",
      "transcription_failed",
      "gte_editor_created",
      "gte_editor_viewed",
      "gte_session_started",
      "gte_session_ended",
    ]);

    expect(createdLegacyEvents).toEqual([
      "page_view",
      "transcribe_start",
      "transcribe_queued",
      "transcribe_success",
      "transcribe_error",
      "gte_editor_created",
      "gte_editor_visit",
      "gte_editor_session_start",
      "gte_editor_session_end",
    ]);

    expect(prismaMock.analyticsGteSession.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.analyticsGteSession.update).toHaveBeenCalledTimes(1);
  });

  it("ingests every canonical v2 event emitted by the v2 client helpers", async () => {
    const { prismaMock, createdLegacyEvents } = createPrismaMock();

    const result = await ingestAnalyticsEvents({
      prismaClient: prismaMock,
      accountId: "user_2",
      cookies: { analytics_consent: "granted", analytics_anon: "anon_v2", analytics_session: "sess_v2" },
      body: {
        events: [
          {
            event_id: "b6ca4f8d-cfd0-4767-a735-2a795b1cb8e1",
            schema_version: 2,
            name: "page_viewed",
            ts: "2026-03-30T10:00:00.000Z",
            session_id: "sess_v2",
            props: { path: "/" },
          },
          {
            event_id: "16e2a67c-7cc6-4e80-82f0-4b74bdbfa26d",
            schema_version: 2,
            name: "transcription_started",
            ts: "2026-03-30T10:01:00.000Z",
            session_id: "sess_v2",
            props: { mode: "FILE" },
          },
          {
            event_id: "8bc73a28-a92f-4f9a-aea8-cd6f4f9d4e2b",
            schema_version: 2,
            name: "transcription_succeeded",
            ts: "2026-03-30T10:02:00.000Z",
            session_id: "sess_v2",
            props: { mode: "FILE" },
          },
          {
            event_id: "d5f5d8fb-58e5-4f20-9dc8-a11db56bd643",
            schema_version: 2,
            name: "transcription_failed",
            ts: "2026-03-30T10:03:00.000Z",
            session_id: "sess_v2",
            props: { errorMessage: "fail" },
          },
          {
            event_id: "6f7ce12b-8e9d-4ab3-b56a-f026ed4f2ce8",
            schema_version: 2,
            name: "gte_editor_viewed",
            ts: "2026-03-30T10:04:00.000Z",
            session_id: "sess_v2",
            props: { editorId: "ed_2" },
          },
          {
            event_id: "8d4cf59d-86dc-455e-8c38-6ff39b79673d",
            schema_version: 2,
            name: "gte_session_started",
            ts: "2026-03-30T10:05:00.000Z",
            session_id: "sess_v2",
            props: { editorId: "ed_2", sessionId: "sess_v2" },
          },
          {
            event_id: "ff311e53-32ef-4153-a10a-63dcc6724ca8",
            schema_version: 2,
            name: "gte_session_ended",
            ts: "2026-03-30T10:06:00.000Z",
            session_id: "sess_v2",
            props: { editorId: "ed_2", sessionId: "sess_v2", durationSec: 15 },
          },
          {
            event_id: "8b96efe5-f09d-40df-a1f4-264f31666f55",
            schema_version: 2,
            name: "gte_editor_created",
            ts: "2026-03-30T10:07:00.000Z",
            session_id: "sess_v2",
            props: { editorId: "ed_2" },
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.received).toBe(8);
    expect(result.written).toBe(8);
    expect(result.dualWritten).toBe(8);

    expect(createdLegacyEvents).toEqual([
      "page_view",
      "transcription_started",
      "transcription_completed",
      "transcription_failed",
      "gte_editor_visit",
      "gte_editor_session_start",
      "gte_editor_session_end",
      "gte_editor_created",
    ]);

    expect(prismaMock.analyticsGteSession.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.analyticsGteSession.update).toHaveBeenCalledTimes(1);
  });
});
