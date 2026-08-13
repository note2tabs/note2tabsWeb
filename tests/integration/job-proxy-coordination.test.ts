import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const { sessionMock, fetchMock, prismaMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  fetchMock: vi.fn(),
  prismaMock: {
    tabJob: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

vi.mock("../../lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("job proxy backend coordination", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionMock.mockReset();
    fetchMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    for (const method of Object.values(prismaMock.tabJob)) method.mockReset();
    prismaMock.tabJob.findUnique.mockResolvedValue(null);
    prismaMock.tabJob.findFirst.mockResolvedValue(null);
    prismaMock.tabJob.findMany.mockResolvedValue([]);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("BACKEND_API_BASE_URL", "https://backend.test");
    vi.stubEnv("BACKEND_SHARED_SECRET", "secret_test");
  });

  it("forwards conditional job polling and returns backend validators", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 304,
        headers: { ETag: '"job-version-2"', "Retry-After": "5" },
      })
    );
    const handler = (await import("../../pages/api/jobs/[job_id]")).default;
    const { req, res } = createMocks({
      method: "GET",
      query: { job_id: "job_123" },
      headers: { "if-none-match": '"job-version-2"' },
    });

    await handler(req as any, res as any);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.test/api/v1/jobs/job_123",
      expect.objectContaining({
        headers: expect.objectContaining({
          "If-None-Match": '"job-version-2"',
          "X-Backend-Secret": "secret_test",
          "X-User-Id": "user_1",
        }),
      })
    );
    expect(res._getStatusCode()).toBe(304);
    expect(res.getHeader("etag")).toBe('"job-version-2"');
    expect(res.getHeader("retry-after")).toBe("5");
  });

  it("passes signed artifact redirects and range headers without downloading the file", async () => {
    const signedUrl = "https://storage.googleapis.com/note2tabs/private-preview.mp3?signature=short-lived";
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { Location: signedUrl, "Accept-Ranges": "bytes" },
      })
    );
    const handler = (await import("../../pages/api/jobs/[job_id]/artifacts/[artifact]")).default;
    const { req, res } = createMocks({
      method: "GET",
      query: { job_id: "job_123", artifact: "preview_audio" },
      headers: { range: "bytes=1024-2047", "if-range": '"audio-version-1"' },
    });

    await handler(req as any, res as any);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.test/api/v1/jobs/job_123/artifacts/preview_audio",
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({
          Range: "bytes=1024-2047",
          "If-Range": '"audio-version-1"',
          "X-User-Id": "user_1",
        }),
      })
    );
    expect(res._getStatusCode()).toBe(307);
    expect(res.getHeader("location")).toBe(signedUrl);
    expect(res.getHeader("accept-ranges")).toBe("bytes");
    expect(res._getData()).toBe("");
  });

  it("streams a local partial artifact response without materializing an array buffer", async () => {
    const upstream = new Response(new Uint8Array([10, 20, 30]), {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": "3",
        "Content-Range": "bytes 2-4/10",
        "Content-Type": "audio/mpeg",
      },
    });
    const arrayBufferSpy = vi.spyOn(upstream, "arrayBuffer");
    fetchMock.mockResolvedValue(upstream);
    const handler = (await import("../../pages/api/jobs/[job_id]/artifacts/[artifact]")).default;
    const { req, res } = createMocks({
      method: "GET",
      query: { job_id: "job_123", artifact: "preview_audio" },
      headers: { range: "bytes=2-4" },
    });
    const write = res.write.bind(res);
    vi.spyOn(res, "write").mockImplementation(((chunk: unknown) => {
      write(chunk as never);
      return true;
    }) as typeof res.write);

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(206);
    expect(res.getHeader("content-range")).toBe("bytes 2-4/10");
    expect(res._getBuffer()).toEqual(Buffer.from([10, 20, 30]));
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it("preserves the queued redo response so clients continue polling the root job", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          job_id: "job_123",
          redoJobId: "redo_456",
          status: "processing",
          workflowState: "processing",
        }),
        { status: 202, headers: { "Content-Type": "application/json", "Retry-After": "2" } }
      )
    );
    const handler = (await import("../../pages/api/jobs/[job_id]/redo")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { job_id: "job_123" },
      body: { onsetThresh: 0.45 },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(202);
    expect(res.getHeader("retry-after")).toBe("2");
    expect(res.getHeader("location")).toBe("/api/jobs/job_123");
    expect(JSON.parse(res._getData())).toEqual({
      ok: true,
      job_id: "job_123",
      redoJobId: "redo_456",
      status: "processing",
      workflowState: "processing",
    });
  });

  it("persists a completed result by indexed backend id and acknowledges durability", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: "job_123",
            status: "succeeded",
            sourceLabel: "Completed song",
            tabs: [["e|--0--"]],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    prismaMock.tabJob.upsert.mockResolvedValue({ id: "tab_123", userId: "user_1" });

    const handler = (await import("../../pages/api/jobs/[job_id]")).default;
    const { req, res } = createMocks({
      method: "GET",
      query: { job_id: "job_123" },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(prismaMock.tabJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { backendJobId: "job_123" },
        create: expect.objectContaining({
          backendJobId: "job_123",
          userId: "user_1",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://backend.test/api/v1/jobs/job_123/persisted",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Backend-Secret": "secret_test",
          "X-User-Id": "user_1",
        }),
        body: JSON.stringify({ durableResultId: "tab_123" }),
      })
    );
    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining({ tabJobId: "tab_123", tab_job_id: "tab_123" })
    );
  });
});
