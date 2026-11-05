import { describe, it, expect, vi, afterEach } from "vitest";
const { execute, query, transaction } = vi.hoisted(() => ({ execute: vi.fn().mockResolvedValue(1), query: vi.fn().mockResolvedValue([]), transaction: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../lib/prisma", () => ({ prisma: { $executeRaw: execute, $queryRaw: query, $transaction: transaction } }));
import { recordEngagementEvents, decideForAccount } from "../../../lib/engagement/server";
import type { NormalizedIngestEvent } from "../../../lib/analyticsV2/schemas";
import { DAY } from "../../../lib/engagement/policy";
const event = (extra: Partial<NormalizedIngestEvent> = {}): NormalizedIngestEvent => ({ eventId: "event", schemaVersion: 2, name: "transcription_submission_blocked", ts: new Date(), props: { blocked_reason: "credits_exhausted", filename: "private-song.wav", content: "private" }, rawOriginal: {}, ...extra });
describe("durable shadow engagement", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("does not touch the database when collection is disabled", async () => {
    vi.stubEnv("ENGAGEMENT_SIGNALS_ENABLED", "false");
    await recordEngagementEvents("a", [event()]); expect(execute).not.toHaveBeenCalled();
  });
  it("stores only relevant bounded structured signals with stable event IDs", async () => {
    vi.stubEnv("ENGAGEMENT_SIGNALS_ENABLED", "true");
    await recordEngagementEvents("a", [event(), event({ name: "$pageview" }), event({ ts: new Date(Date.now() + DAY) })]);
    expect(execute).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(execute.mock.calls[0].at(-1))[0].payload;
    expect(payload).toMatchObject({ reason: "credits_exhausted" });
    expect(payload.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload).not.toHaveProperty("filename"); expect(payload).not.toHaveProperty("content");
  });
  it("batches signals and keeps their original identity and timestamps", async () => {
    vi.stubEnv("ENGAGEMENT_SIGNALS_ENABLED", "true");
    const events=Array.from({length:205},(_,i)=>event({eventId:`event-${i}`}));
    await recordEngagementEvents("a",events);
    expect(execute).toHaveBeenCalledTimes(3);expect(transaction).not.toHaveBeenCalled();
    const rows=execute.mock.calls.flatMap(call=>JSON.parse(call.at(-1)));
    expect(rows).toHaveLength(205);expect(new Set(rows.map(row=>row.id)).size).toBe(205);
    expect(rows.map(row=>row.at)).toEqual(events.map(event=>event.ts.toISOString()));
  });
  it("marks truncated snapshots incomplete and returns no promotion", async () => {
    const at = Date.now();
    query.mockResolvedValueOnce(Array.from({ length: 2001 }, (_, i) => ({ payload: { id: `${i}`, name: "gte_export_download_initiated", at: at - DAY, project: "p" } })));
    const result = await decideForAccount("a", { channel: "premium", paid: false, marketingPermission: false, emailVerified: false, suppressed: false, safeMoment: true, accessibleSavedWork: false }, at);
    expect(result.snapshot.complete).toBe(false); expect(result.decision.reasons).toEqual(["incomplete_history"]);
  });
});
