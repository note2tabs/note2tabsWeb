import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";
const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: session }));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
import handler from "../../pages/api/jobs/[job_id]/preview";
const payload = { version: 1, streamId: "attempt", revision: 2, processedSeconds: 2, durationSeconds: 10, complete: false, tracks: [] };
beforeEach(() => { session.mockResolvedValue({ user: { id: "owner" } }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
const request = () => createMocks({ method: "GET", query: { job_id: "job" } });
it("requires a session before contacting the backend", async () => {
  session.mockResolvedValue(null); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const { req, res } = request(); await handler(req as any, res as any);
  expect(res._getStatusCode()).toBe(401); expect(fetch).not.toHaveBeenCalled();
});
it("forwards account identity, respects backend ownership and never caches", async () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 403 })); vi.stubGlobal("fetch", fetch);
  const { req, res } = request(); await handler(req as any, res as any);
  expect(res._getStatusCode()).toBe(403);
  expect((fetch.mock.calls[0][1]?.headers as Record<string, string>)["X-User-Id"]).toBe("owner");
  expect(res.getHeader("Cache-Control")).toContain("no-store");
});
it("removes internal credentials before following the signed artifact URL", async () => {
  vi.stubEnv("BACKEND_SHARED_SECRET", "internal-secret");
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "https://storage.googleapis.com/bucket/preview?signature=secret" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
  vi.stubGlobal("fetch", fetch); const { req, res } = request(); await handler(req as any, res as any);
  expect(res._getStatusCode()).toBe(200); expect(res._getJSONData()).toEqual(payload);
  expect(fetch.mock.calls[1][1].headers).toBeUndefined();
  expect(fetch.mock.calls[0][1].headers["X-Backend-Secret"]).toBe("internal-secret");
});
it("bounds artifact reads and rejects malformed previews", async () => {
  for (const body of ["x".repeat(2_000_001), JSON.stringify({ ...payload, revision: NaN }), "not json"]) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    const { req, res } = request(); await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(502);
  }
});
