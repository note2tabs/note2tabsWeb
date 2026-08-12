import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const { sessionMock, fetchMock, attachmentMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  fetchMock: vi.fn(),
  attachmentMock: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("../../lib/prisma", () => ({
  prisma: { gteAudioAttachment: attachmentMock },
}));

describe("GTE source audio", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_REAL_AUDIO_SYNC_ENABLED", "true");
    vi.stubEnv("BACKEND_API_BASE_URL", "https://backend.test");
    vi.stubEnv("BACKEND_SHARED_SECRET", "backend-secret");
    vi.stubGlobal("fetch", fetchMock);
    sessionMock.mockReset();
    fetchMock.mockReset();
    Object.values(attachmentMock).forEach((method) => method.mockReset());
    sessionMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("proves backend ownership before attaching a source job", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          jobId: "job-1",
          status: "available",
          available: true,
          reattachable: false,
          playbackOffsetSeconds: 0,
          sourceClipStartSeconds: 0,
          clipDurationSeconds: 30,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    attachmentMock.upsert.mockResolvedValue({
      sourceJobId: "job-1",
      timelineOffsetFrames: 960,
      clipOffsetSeconds: 0.125,
    });
    const handler = (await import("../../pages/api/gte/source-audio/[editor_id]")).default;
    const { req, res } = createMocks({
      method: "PUT",
      query: { editor_id: "canvas-1" },
      body: {
        sourceJobId: "job-1",
        timelineOffsetFrames: 960,
        clipOffsetSeconds: 0.125,
      },
    });

    await handler(req as never, res as never);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.test/api/v1/jobs/job-1/source-audio",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-User-Id": "user-1",
          "X-Backend-Secret": "backend-secret",
        }),
      })
    );
    expect(attachmentMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user-1",
          editorId: "canvas-1",
          sourceJobId: "job-1",
          timelineOffsetFrames: 960,
        }),
      })
    );
    expect(res._getStatusCode()).toBe(200);
  });

  it("redirects only to Google Storage and keeps the signed URL out of the database", async () => {
    attachmentMock.findUnique.mockResolvedValue({ sourceJobId: "job-1" });
    const signed = "https://storage.googleapis.com/private/source.opus?X-Goog-Signature=secret";
    fetchMock.mockResolvedValue(new Response(null, { status: 307, headers: { Location: signed } }));
    const handler = (
      await import("../../pages/api/gte/source-audio/[editor_id]/stream")
    ).default;
    const { req, res } = createMocks({
      method: "GET",
      query: { editor_id: "canvas-1" },
    });

    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(307);
    expect(res.getHeader("location")).toBe(signed);
    expect(attachmentMock.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { sourceJobId: true },
      })
    );
    expect(attachmentMock.upsert).not.toHaveBeenCalled();
  });

  it("queues a pasted YouTube source only after editor ownership is verified", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "canvas-1" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_id: "source-job-1", status: "queued" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      );
    attachmentMock.findUnique.mockResolvedValue(null);
    attachmentMock.upsert.mockResolvedValue({
      sourceJobId: "source-job-1",
      timelineOffsetFrames: 480,
      clipOffsetSeconds: 0,
    });
    const handler = (await import("../../pages/api/gte/source-audio/[editor_id]")).default;
    const { req, res } = createMocks({
      method: "POST",
      headers: { host: "note2tabs.test", origin: "https://note2tabs.test" },
      query: { editor_id: "canvas-1" },
      body: {
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        timelineOffsetFrames: 480,
      },
    });

    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(202);
    expect(fetchMock.mock.calls[0][0]).toBe("https://backend.test/gte/editors/canvas-1");
    expect(fetchMock.mock.calls[1][0]).toBe("https://backend.test/api/v1/source-audio");
    expect(attachmentMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceJobId: "source-job-1",
          timelineOffsetFrames: 480,
        }),
      })
    );
  });

  it("rejects cross-site source preparation before doing backend work", async () => {
    const handler = (await import("../../pages/api/gte/source-audio/[editor_id]")).default;
    const { req, res } = createMocks({
      method: "POST",
      headers: { host: "note2tabs.test", origin: "https://attacker.test" },
      query: { editor_id: "canvas-1" },
      body: { youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });

    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(attachmentMock.upsert).not.toHaveBeenCalled();
  });

  it("rejects a backend redirect to an untrusted host", async () => {
    attachmentMock.findUnique.mockResolvedValue({ sourceJobId: "job-1" });
    fetchMock.mockResolvedValue(
      new Response(null, { status: 307, headers: { Location: "https://attacker.test/audio" } })
    );
    const handler = (
      await import("../../pages/api/gte/source-audio/[editor_id]/stream")
    ).default;
    const { req, res } = createMocks({ method: "GET", query: { editor_id: "canvas-1" } });

    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(502);
    expect(res.getHeader("location")).toBeUndefined();
  });

  it("fails closed before authentication when the production flag is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_REAL_AUDIO_SYNC_ENABLED", "false");
    sessionMock.mockResolvedValue(null);
    const handler = (await import("../../pages/api/gte/source-audio/[editor_id]")).default;
    const { req, res } = createMocks({ method: "GET", query: { editor_id: "canvas-1" } });

    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(sessionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
