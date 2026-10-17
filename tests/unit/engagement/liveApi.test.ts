import { describe, it, expect, vi, afterEach } from "vitest";
import { createMocks } from "node-mocks-http";
const m = vi.hoisted(() => ({ enabled: vi.fn(), session: vi.fn(), user: vi.fn(), enrollment: vi.fn(), reserve: vi.fn(), finish: vi.fn(), decision: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: m.session }));
vi.mock("../../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("../../../lib/prisma", () => ({ prisma: { user: { findUnique: m.user } } }));
vi.mock("../../../lib/engagement/experiment", () => ({ experimentEnabled: m.enabled, getEngagementEnrollment: m.enrollment, reserveEngagementContact: m.reserve, recordExperimentDecision: vi.fn(), finishEngagementContact: m.finish }));
vi.mock("../../../lib/engagement/server", () => ({ decideForAccount: m.decision }));
import handler from "../../../pages/api/engagement/experiment";
import { buildEngagementSnapshot, DAY } from "../../../lib/engagement/policy";
const setup = (arm: string) => { m.enabled.mockReturnValue(true); m.session.mockResolvedValue({ user: { id: "actual-account" } }); m.user.mockResolvedValue({ role: "FREE", subscriptionPlan: "FREE" }); m.enrollment.mockResolvedValue({ arm }); };
describe("live experiment authorization", () => {
  afterEach(() => vi.resetAllMocks());
  it("counts the control assignment without evaluating or reserving a prompt", async () => {
    setup("control"); const { req, res } = createMocks({ method: "POST", body: { operation: "claim", checkpoint: "legacy", safeMoment: true } });
    await handler(req as any, res as any); expect(res._getJSONData()).toMatchObject({ arm: "control", show: false }); expect(m.enrollment).toHaveBeenCalledWith("actual-account"); expect(m.reserve).not.toHaveBeenCalled(); expect(m.decision).not.toHaveBeenCalled();
  });
  it("does not accept a spoofed free entitlement or different account", async () => {
    setup("contextual"); m.user.mockResolvedValue({ role: "PREMIUM", subscriptionPlan: "PREMIUM" });
    const { req, res } = createMocks({ method: "POST", body: { accountId: "other", paid: false } });
    await handler(req as any, res as any); expect(res._getJSONData().mode).toBe("excluded"); expect(m.enrollment).not.toHaveBeenCalled();
  });
  it("only allows the contextual arm at its single playback checkpoint", async () => {
    setup("contextual"); const at = Date.now();
    const snapshot = buildEngagementSnapshot([{ id: "e", name: "gte_export_download_initiated", project: "p", at: at - DAY }, { id: "i", name: "gte_file_import_completed", project: "p", at: at - DAY }], at);
    m.decision.mockResolvedValue({ snapshot }); m.reserve.mockResolvedValue("contact");
    const wrong = createMocks({ method: "POST", body: { operation: "claim", checkpoint: "legacy", safeMoment: true } }); await handler(wrong.req as any, wrong.res as any); expect(wrong.res._getJSONData().show).toBe(false);
    const right = createMocks({ method: "POST", body: { operation: "claim", checkpoint: "playback_pause", safeMoment: true } }); await handler(right.req as any, right.res as any); expect(right.res._getJSONData()).toMatchObject({ show: true, contactId: "contact" });
  });
  it("excludes analytics opt-out before assignment", async () => {
    setup("existing"); const { req, res } = createMocks({ method: "POST", headers: { cookie: "analytics_consent=denied" } });
    await handler(req as any, res as any); expect(res._getJSONData().mode).toBe("excluded"); expect(m.enrollment).not.toHaveBeenCalled();
  });
});
