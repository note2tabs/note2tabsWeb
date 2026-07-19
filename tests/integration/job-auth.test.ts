import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const sessionMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

describe("job API authentication", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionMock.mockReset();
    fetchMock.mockReset();
    sessionMock.mockResolvedValue(null);
    vi.stubGlobal("fetch", fetchMock);
  });

  it.each([
    ["status", "GET", () => import("../../pages/api/jobs/[job_id]")],
    ["artifact", "GET", () => import("../../pages/api/jobs/[job_id]/artifacts/[artifact]")],
    ["redo", "POST", () => import("../../pages/api/jobs/[job_id]/redo")],
    ["finalize", "POST", () => import("../../pages/api/jobs/[job_id]/finalize")],
  ])("rejects anonymous %s requests before contacting the backend", async (_name, method, loadHandler) => {
    const handler = (await loadHandler()).default;
    const { req, res } = createMocks({
      method: method as "GET" | "POST",
      query: { job_id: "job_123", artifact: "preview_audio" },
      body: {},
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({ error: "Not authenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
