import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";
const mocks = vi.hoisted(() => ({ ingest: vi.fn(), token: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.token }));
vi.mock("../../lib/analyticsV2/ingest", () => ({ ingestAnalyticsEvents: mocks.ingest }));
import handler from "../../pages/api/analytics/ingest";
describe("analytics verified identity", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.token.mockReset();
    mocks.ingest.mockReset().mockResolvedValue({ ok: true });
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([{ id: "user_1" }, null, { id: 42 }])("uses only a verified string id: %j", async (token) => {
    mocks.token.mockResolvedValue(token);
    const { req, res } = createMocks({ method: "POST", body: { accountId: "forged" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(mocks.ingest).toHaveBeenCalledWith(expect.objectContaining({ accountId: typeof token?.id === "string" ? token.id : null }));
  });
  it("verifies real session cookies and treats a tampered token as anonymous", async () => {
    const jwt = await vi.importActual<typeof import("next-auth/jwt")>("next-auth/jwt");
    vi.stubEnv("NEXTAUTH_SECRET", "analytics-test-secret");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    mocks.token.mockImplementation(jwt.getToken);
    const encoded = await jwt.encode({ token: { id: "verified_user" }, secret: "analytics-test-secret" });
    for (const [cookie, expected] of [[encoded, "verified_user"], [encoded + "tampered", null]] as const) {
      const { req, res } = createMocks({ method: "POST", cookies: { "next-auth.session-token": cookie } });
      await handler(req, res);
      expect(mocks.ingest).toHaveBeenLastCalledWith(expect.objectContaining({ accountId: expected }));
    }
  });
  it("rejects non-POST requests before reading identity", async () => {
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(mocks.token).not.toHaveBeenCalled();
  });
});
