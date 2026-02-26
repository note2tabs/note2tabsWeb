import { describe, expect, it, vi } from "vitest";
import { ingestAnalyticsEvents } from "../../lib/analyticsV2/ingest";

function createPrismaMock() {
  const seenEventIds = new Set<string>();
  const analyticsEventV2Create = vi.fn(async ({ data }: { data: { eventId: string } }) => {
    if (seenEventIds.has(data.eventId)) {
      throw { code: "P2002" };
    }
    seenEventIds.add(data.eventId);
    return { id: BigInt(seenEventIds.size), ...data };
  });

  return {
    analyticsEventV2: {
      create: analyticsEventV2Create,
      findFirst: vi.fn(async () => null),
    },
    analyticsEvent: {
      create: vi.fn(async ({ data }: { data: unknown }) => data),
    },
    analyticsConsentSubject: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: any }) => ({ id: BigInt(1), ...data })),
      update: vi.fn(async ({ data }: { data: any }) => ({ id: BigInt(1), ...data })),
    },
    analyticsGteSession: {
      upsert: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
  } as any;
}

describe("ingestAnalyticsEvents", () => {
  it("ingests canonical events and dual-writes to legacy table", async () => {
    const prismaMock = createPrismaMock();

    const result = await ingestAnalyticsEvents({
      prismaClient: prismaMock,
      accountId: "user_1",
      cookies: { analytics_consent: "granted", analytics_anon: "anon_1", analytics_session: "sess_1" },
      body: {
        event_id: "3a3e8f2f-bf7d-4af8-b395-90bd9393b182",
        schema_version: 2,
        name: "transcription_started",
        ts: "2026-02-26T10:00:00.000Z",
        props: { mode: "FILE" },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.received).toBe(1);
    expect(result.written).toBe(1);
    expect(result.dualWritten).toBe(1);
    expect(prismaMock.analyticsEventV2.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.analyticsEvent.create).toHaveBeenCalledTimes(1);
  });

  it("accepts legacy payload format and normalizes event names", async () => {
    const prismaMock = createPrismaMock();

    await ingestAnalyticsEvents({
      prismaClient: prismaMock,
      cookies: { analytics_consent: "granted", analytics_anon: "anon_2", analytics_session: "sess_2" },
      body: {
        event: "transcribe_start",
        path: "/transcriber",
        payload: { mode: "FILE" },
      },
    });

    const call = prismaMock.analyticsEventV2.create.mock.calls[0][0];
    expect(call.data.name).toBe("transcription_started");
    expect(call.data.legacyEventName).toBe("transcribe_start");
  });

  it("skips writes when consent is denied", async () => {
    const prismaMock = createPrismaMock();

    const result = await ingestAnalyticsEvents({
      prismaClient: prismaMock,
      cookies: { analytics_consent: "denied" },
      body: {
        event: "page_view",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(1);
    expect(prismaMock.analyticsEventV2.create).not.toHaveBeenCalled();
  });

  it("dedupes repeated event_id values", async () => {
    const prismaMock = createPrismaMock();
    const body = {
      event_id: "525cfce7-cc73-4640-b6ad-fd3e8bbf25f7",
      schema_version: 2,
      name: "page_viewed",
      ts: "2026-02-26T10:00:00.000Z",
      props: { path: "/" },
    };

    const first = await ingestAnalyticsEvents({
      prismaClient: prismaMock,
      cookies: { analytics_consent: "granted", analytics_anon: "anon_3", analytics_session: "sess_3" },
      body,
    });
    const second = await ingestAnalyticsEvents({
      prismaClient: prismaMock,
      cookies: { analytics_consent: "granted", analytics_anon: "anon_3", analytics_session: "sess_3" },
      body,
    });

    expect(first.written).toBe(1);
    expect(second.written).toBe(0);
    expect(second.deduped).toBe(1);
  });
});
