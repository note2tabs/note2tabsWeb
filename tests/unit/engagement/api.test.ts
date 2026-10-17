import { describe, it, expect, vi, afterEach } from "vitest";
import { createMocks } from "node-mocks-http";
const { enabled, session, findUser, decide } = vi.hoisted(() => ({ enabled: vi.fn(), session: vi.fn(), findUser: vi.fn(), decide: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: session }));
vi.mock("../../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("../../../lib/prisma", () => ({ prisma: { user: { findUnique: findUser } } }));
vi.mock("../../../lib/engagement/server", () => ({ engagementCollectionEnabled: enabled, decideForAccount: decide }));
import handler from "../../../pages/api/engagement/decision";
describe("account-scoped shadow endpoint", () => {
  afterEach(() => vi.resetAllMocks());
  it("is inert while disabled", async () => {
    enabled.mockReturnValue(false);
    const { req, res } = createMocks({ method: "POST" }); await handler(req as any, res as any);
    expect(res._getJSONData()).toEqual({ mode: "disabled" }); expect(session).not.toHaveBeenCalled();
  });
  it("requires authentication and honors opt-out", async () => {
    enabled.mockReturnValue(true); session.mockResolvedValue(null);
    const one = createMocks({ method: "POST" }); await handler(one.req as any, one.res as any);
    expect(one.res._getStatusCode()).toBe(401);
    session.mockResolvedValue({ user: { id: "a" } });
    const two = createMocks({ method: "POST", headers: { cookie: "analytics_consent=denied" } }); await handler(two.req as any, two.res as any);
    expect(decide).not.toHaveBeenCalled(); expect(two.res._getJSONData().mode).toBe("disabled");
  });
  it("ignores client identity/entitlement and cannot authorize email or incentives", async () => {
    enabled.mockReturnValue(true); session.mockResolvedValue({ user: { id: "a" } });
    findUser.mockResolvedValue({ role: "PREMIUM", subscriptionPlan: "PREMIUM" });
    decide.mockResolvedValue({ decision: { action: "none" } });
    const { req, res } = createMocks({ method: "POST", body: { accountId: "other", paid: false, channel: "email", safeMoment: true } });
    await handler(req as any, res as any);
    expect(decide).toHaveBeenCalledWith("a", expect.objectContaining({ paid: true, channel: "premium", marketingPermission: false }));
    expect(res._getJSONData().mode).toBe("shadow"); expect(res.getHeader("Cache-Control")).toContain("no-store");
  });
});
