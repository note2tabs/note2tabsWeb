import { describe, it, expect, vi } from "vitest";
const { raw, tx, capture, flush } = vi.hoisted(() => ({ raw: vi.fn(), tx: vi.fn(), capture: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../lib/prisma", () => ({ prisma: { $queryRaw: raw, $transaction: tx } }));
vi.mock("../../../lib/posthogServer", () => ({ createPostHogServerClient: () => ({ capture, flush, getFeatureFlag: vi.fn().mockResolvedValue("existing") }), createPostHogIngestClient: () => ({ capture, flush }), stablePostHogEventUuid: (v: string) => v }));
import { assignEngagementArm, getEngagementEnrollment, reserveEngagementContact } from "../../../lib/engagement/experiment";
import { ENGAGEMENT_EXPERIMENT_ARMS, ENGAGEMENT_CTA_DELAY_MS, contextualValueScore, contextualPremiumAllowed } from "../../../lib/engagement/experimentConfig";
import { buildEngagementSnapshot, DAY } from "../../../lib/engagement/policy";
describe("three-arm engagement experiment", () => {
  it("keeps exactly three account-level groups and one timing", () => {
    expect(ENGAGEMENT_EXPERIMENT_ARMS).toEqual(["control", "existing", "contextual"]);
    expect(ENGAGEMENT_CTA_DELAY_MS).toBe(1200);
    const counts = { control: 0, existing: 0, contextual: 0 };
    for (let i = 0; i < 30000; i++) { const id = `synthetic-${i}`; const arm = assignEngagementArm(id); counts[arm]++; expect(assignEngagementArm(id)).toBe(arm); }
    expect(counts.control / 30000).toBeGreaterThan(.32); expect(counts.control / 30000).toBeLessThan(.36);
    for (const key of ["existing", "contextual"] as const) { expect(counts[key] / 30000).toBeGreaterThan(.31); expect(counts[key] / 30000).toBeLessThan(.35); }
  });
  it("uses the persisted assignment and original time before recording exposure", async () => {
    const enrolledAt = new Date("2026-10-17T00:00:00Z");
    raw.mockResolvedValueOnce([{ accountId: "a", version: "engagement-policy-v1", arm: "control", enrolledAt }]);
    const e = await getEngagementEnrollment("a"); expect(e.arm).toBe("control");
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ event: "engagement_policy_assigned", timestamp: enrolledAt, properties: expect.objectContaining({ "$feature/engagement-policy-v1": "control" }) }));
    expect(flush).toHaveBeenCalled();
  });
  it("cannot reserve a contact in the no-intervention group", async () => {
    tx.mockClear(); expect(await reserveEngagementContact({ accountId: "a", version: "v", arm: "control", enrolledAt: new Date() }, "email", "resume")).toBeNull(); expect(tx).not.toHaveBeenCalled();
  });
  it("checks cross-campaign recent contact under a transaction lock", async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "prior" }]); const execute = vi.fn();
    tx.mockImplementationOnce((fn: any) => fn({ $queryRaw: query, $executeRaw: execute }));
    const ticket = await reserveEngagementContact({ accountId: "a", version: "v", arm: "existing", enrolledAt: new Date() }, "premium", "legacy");
    expect(ticket).toBeNull(); expect(query.mock.calls[0][0].join("")).toContain("pg_advisory_xact_lock"); expect(execute).not.toHaveBeenCalled();
  });
  it("uses capped value evidence and never outweighs paid, failure or dismissal gates", () => {
    const at = Date.now(); const events = [
      { id: "1", at: at - 3 * DAY, name: "gte_export_download_initiated", project: "p" },
      { id: "2", at: at - 3 * DAY + 1, name: "gte_file_import_completed", project: "p" },
    ];
    const s = buildEngagementSnapshot(events, at); expect(contextualValueScore(s)).toBe(6); expect(contextualPremiumAllowed(s, false, true)).toBe(true);
    expect(contextualPremiumAllowed(s, true, true)).toBe(false);
    expect(contextualPremiumAllowed({ ...s, unresolvedFailure: true }, false, true)).toBe(false);
    expect(contextualPremiumAllowed({ ...s, lastDismissedAt: at - DAY }, false, true)).toBe(false);
    expect(contextualPremiumAllowed(s, false, false)).toBe(false);
    expect(contextualValueScore({ ...s, exports: 100 })).toBe(contextualValueScore(s));
  });
});
