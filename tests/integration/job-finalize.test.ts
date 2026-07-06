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

describe("job finalize endpoint", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionMock.mockReset();
    fetchMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("BACKEND_API_BASE_URL", "https://backend.test");
    vi.stubEnv("BACKEND_SHARED_SECRET", "secret_test");
  });

  it("forwards multipleGuitars false as false", async () => {
    const handler = (await import("../../pages/api/jobs/[job_id]/finalize")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { job_id: "job_123" },
      body: { multipleGuitars: false },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.test/api/v1/jobs/job_123/finalize",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ multipleGuitars: false }),
      })
    );
  });

  it("preserves successful upstream finalize payloads", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ job: { job_id: "job_123", status: "done", workflowState: "finalized" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const handler = (await import("../../pages/api/jobs/[job_id]/finalize")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { job_id: "job_123" },
      body: { multipleGuitars: false },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      job: { job_id: "job_123", status: "done", workflowState: "finalized" },
    });
  });
});
