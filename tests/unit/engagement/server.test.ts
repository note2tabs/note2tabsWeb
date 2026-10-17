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
    const payload = JSON.parse(execute.mock.calls[0].at(-1));
    expect(payload).toMatchObject({ reason: "credits_exhausted" });
    expect(payload.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload).not.toHaveProperty("filename"); expect(payload).not.toHaveProperty("content");
  });
  it("marks truncated snapshots incomplete and returns no promotion", async () => {
    const at = Date.now();
    query.mockResolvedValueOnce(Array.from({ length: 2001 }, (_, i) => ({ payload: { id: `${i}`, name: "gte_export_download_initiated", at: at - DAY, project: "p" } })));
    const result = await decideForAccount("a", { channel: "premium", paid: false, marketingPermission: false, emailVerified: false, suppressed: false, safeMoment: true, accessibleSavedWork: false }, at);
    expect(result.snapshot.complete).toBe(false); expect(result.decision.reasons).toEqual(["incomplete_history"]);
  });
});
