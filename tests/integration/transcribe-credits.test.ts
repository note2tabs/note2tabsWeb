import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  fetch: vi.fn(),
  setBackendCredits: vi.fn(),
  raiseBackendCreditsToFloor: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    tabJob: {
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mocks.session(...args),
}));

vi.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

vi.mock("../../lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("../../lib/serverDevMode", () => ({
  isEmailVerificationRequiredServer: true,
  isLocalNoDbServerMode: false,
}));

vi.mock("../../lib/backendCredits", async () => {
  const actual = await vi.importActual<typeof import("../../lib/backendCredits")>("../../lib/backendCredits");
  return {
    ...actual,
    setBackendCredits: (...args: unknown[]) => mocks.setBackendCredits(...args),
    raiseBackendCreditsToFloor: (...args: unknown[]) => mocks.raiseBackendCreditsToFloor(...args),
  };
});

function makeJsonReq(body: Record<string, unknown>) {
  const req = Readable.from([JSON.stringify(body)]) as NextApiRequest;
  req.method = "POST";
  req.headers = { "content-type": "application/json", "x-vercel-ip-country": "US" };
  return req;
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string | string[]>,
    body: undefined as unknown,
    setHeader(key: string, value: string | string[]) {
      this.headers[key] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as NextApiResponse & typeof res;
}

async function callTranscribe(
  role: string,
  multipleGuitars = false,
  transcriptionModel: "light" | "heavy" | "super_heavy" | null = "heavy",
  duration = 30,
  startTime = 0
) {
  const handler = (await import("../../pages/api/transcribe")).default;
  mocks.session.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: "user_1",
    role,
    tokensRemaining: 10,
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    emailVerifiedBool: true,
    unverifiedTranscriptionUsed: false,
    heavyPreviewUsedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  mocks.prisma.tabJob.groupBy.mockResolvedValue([]);
  mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 });
  mocks.setBackendCredits.mockResolvedValue(10);
  mocks.raiseBackendCreditsToFloor.mockResolvedValue(10);
  mocks.fetch.mockResolvedValue(
    new Response(JSON.stringify({ job_id: "job_123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );

  const req = makeJsonReq({
    mode: "YOUTUBE",
    youtubeUrl: "https://www.youtube.com/watch?v=test",
    startTime,
    duration,
    ...(transcriptionModel ? { transcriptionModel } : {}),
    separateGuitar: false,
    multipleGuitars,
  });
  const res = makeRes();

  await handler(req, res);

  return res;
}

describe("transcribe credits", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.session.mockReset();
    mocks.fetch.mockReset();
    mocks.setBackendCredits.mockReset();
    mocks.raiseBackendCreditsToFloor.mockReset();
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.user.update.mockReset();
    mocks.prisma.user.updateMany.mockReset();
    mocks.prisma.tabJob.groupBy.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("BACKEND_API_BASE_URL", "https://backend.test");
    vi.stubEnv("BACKEND_SHARED_SECRET", "secret_test");
    vi.stubEnv("REQUIRE_EMAIL_VERIFICATION", "false");
  });

  it("deducts credits for free users", async () => {
    const res = await callTranscribe("FREE");

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ credits: { remaining: 7 }, tokensRemaining: 7 });
    expect(mocks.prisma.user.update).toHaveBeenLastCalledWith({
      where: { id: "user_1" },
      data: { tokensRemaining: 7 },
    });
    expect((res.body as { credits: { remaining: number } }).credits.remaining).toBe(7);
  });

  it("deducts credits for admin users too", async () => {
    const res = await callTranscribe("ADMIN");

    expect(res.statusCode).toBe(202);
    expect(mocks.prisma.user.update).toHaveBeenLastCalledWith({
      where: { id: "user_1" },
      data: { tokensRemaining: 7 },
    });
    expect((res.body as { credits: { remaining: number } }).credits.remaining).toBe(7);
  });

  it("defaults premium requests without a model choice to the heavy model", async () => {
    const res = await callTranscribe("PREMIUM", false, null);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ transcriptionModel: "heavy" });
    const [, requestInit] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const body = requestInit.body as FormData;
    expect(body.get("transcription_method")).toBe("yourmt3");
  });

  it("does not spend a verified free account's Heavy preview without an explicit choice", async () => {
    const res = await callTranscribe("FREE", false, null);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      transcriptionModel: "light",
      tokensRemaining: 8,
    });
    expect(res.body.heavyPreviewUsed).toBeUndefined();
    expect(mocks.prisma.user.updateMany).not.toHaveBeenCalled();
    const [, requestInit] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const body = requestInit.body as FormData;
    expect(body.get("transcription_method")).toBe("basic_pitch");
  });

  it("allows one credit-free Heavy preview for a verified free user", async () => {
    const res = await callTranscribe("FREE", false, "super_heavy");

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      heavyPreviewUsed: true,
      transcriptionModel: "super_heavy",
      tokensRemaining: 10,
    });
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "user_1", heavyPreviewUsedAt: null }),
      })
    );
    const [, requestInit] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect((requestInit.body as FormData).get("transcription_method")).toBe("msmodel");
  });

  it("limits the one-time Heavy preview to 30 seconds", async () => {
    const res = await callTranscribe("FREE", false, "super_heavy", 31);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ maxDurationSec: 30 });
    expect(mocks.prisma.user.updateMany).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not expose the Heavy preview outside configured countries", async () => {
    const handler = (await import("../../pages/api/transcribe")).default;
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      role: "FREE",
      subscriptionPlan: "FREE",
      tokensRemaining: 10,
      emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      emailVerifiedBool: true,
      heavyPreviewUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mocks.prisma.tabJob.groupBy.mockResolvedValue([]);
    const req = makeJsonReq({
      mode: "YOUTUBE",
      youtubeUrl: "https://www.youtube.com/watch?v=test",
      startTime: 0,
      duration: 30,
      transcriptionModel: "super_heavy",
    });
    req.headers["x-vercel-ip-country"] = "BR";
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ premiumRequired: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects Heavy after the free preview has been used", async () => {
    const handler = (await import("../../pages/api/transcribe")).default;
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      role: "FREE",
      subscriptionPlan: "FREE",
      tokensRemaining: 10,
      emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      emailVerifiedBool: true,
      unverifiedTranscriptionUsed: false,
      heavyPreviewUsedAt: new Date("2026-09-23T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mocks.prisma.tabJob.groupBy.mockResolvedValue([]);
    const res = makeRes();
    await handler(makeJsonReq({
      mode: "YOUTUBE",
      youtubeUrl: "https://www.youtube.com/watch?v=test",
      startTime: 0,
      duration: 30,
      transcriptionModel: "super_heavy",
    }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ premiumRequired: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("blocks every transcription until an email/password account is verified", async () => {
    const handler = (await import("../../pages/api/transcribe")).default;
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      role: "FREE",
      subscriptionPlan: "FREE",
      tokensRemaining: 10,
      emailVerified: null,
      emailVerifiedBool: false,
      unverifiedTranscriptionUsed: false,
      heavyPreviewUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const res = makeRes();
    await handler(makeJsonReq({
      mode: "YOUTUBE",
      youtubeUrl: "https://www.youtube.com/watch?v=test",
      startTime: 0,
      duration: 30,
      transcriptionModel: "light",
    }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ verificationRequired: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["PREMIUM", "ADMIN", "MODERATOR"])(
    "allows the user-facing Heavy model for %s users",
    async (role) => {
      const res = await callTranscribe(role, false, "super_heavy");

      expect(res.statusCode).toBe(202);
      const [, requestInit] = mocks.fetch.mock.calls[0] as [string, RequestInit];
      const body = requestInit.body as FormData;
      expect(body.get("transcription_method")).toBe("msmodel");
    }
  );

  it("forwards the multiple-guitar choice to the backend transcription job", async () => {
    const res = await callTranscribe("FREE", true);

    expect(res.statusCode).toBe(202);
    const [, requestInit] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(requestInit.body).toBeInstanceOf(FormData);
    const body = requestInit.body as FormData;
    expect(body.get("multiple_guitars")).toBe("true");
  });

  it("rejects free YouTube clips longer than 30 seconds", async () => {
    const res = await callTranscribe("FREE", false, "light", 31);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ maxDurationSec: 30 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["PREMIUM", "ADMIN", "MODERATOR"])(
    "allows %s users to transcribe longer YouTube clips",
    async (role) => {
      const res = await callTranscribe(role, false, "light", 90, 60);

      expect(res.statusCode).toBe(202);
      const [, requestInit] = mocks.fetch.mock.calls[0] as [string, RequestInit];
      const body = requestInit.body as FormData;
      expect(body.get("start_time")).toBe("60");
      expect(body.get("duration")).toBe("90");
    }
  );

  it("rejects Premium YouTube clips extending beyond the first ten minutes", async () => {
    const res = await callTranscribe("PREMIUM", false, "light", 31, 570);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ maxEndTimeSec: 600 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("limits free file uploads to one minute", async () => {
    const handler = (await import("../../pages/api/transcribe")).default;
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      role: "FREE",
      tokensRemaining: 10,
      emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      emailVerifiedBool: true,
      unverifiedTranscriptionUsed: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mocks.prisma.tabJob.groupBy.mockResolvedValue([]);
    mocks.setBackendCredits.mockResolvedValue(10);

    const req = makeJsonReq({
      mode: "FILE",
      s3Key: "uploads/test.mp3",
      fileName: "test.mp3",
      startTime: 0,
      duration: 61,
      transcriptionModel: "light",
      separateGuitar: false,
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ maxDurationSec: 60 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("forwards premium file clip ranges to the backend", async () => {
    const handler = (await import("../../pages/api/transcribe")).default;
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      role: "ADMIN",
      tokensRemaining: 10,
      emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      emailVerifiedBool: true,
      unverifiedTranscriptionUsed: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mocks.prisma.tabJob.groupBy.mockResolvedValue([]);
    mocks.raiseBackendCreditsToFloor.mockResolvedValue(10);
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ job_id: "job_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const req = makeJsonReq({
      mode: "FILE",
      s3Key: "uploads/test.mp3",
      fileName: "test.mp3",
      startTime: 15,
      duration: 90,
      transcriptionModel: "light",
      separateGuitar: false,
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    const [url, requestInit] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://backend.test/process_audio_s3");
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      startTime: 15,
      start_time: 15,
      duration: 90,
    });
  });

  it("forwards selected file clip timing to the S3 backend transcription job", async () => {
    const handler = (await import("../../pages/api/transcribe")).default;
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      role: "FREE",
      tokensRemaining: 10,
      emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      emailVerifiedBool: true,
      unverifiedTranscriptionUsed: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mocks.prisma.tabJob.groupBy.mockResolvedValue([]);
    mocks.setBackendCredits.mockResolvedValue(10);
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ job_id: "job_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const req = makeJsonReq({
      mode: "FILE",
      s3Key: "uploads/output.mp3",
      fileName: "output.mp3",
      startTime: 0,
      duration: 6,
      transcriptionModel: "light",
      separateGuitar: false,
      multipleGuitars: false,
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    const [url, requestInit] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://backend.test/process_audio_s3");
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      s3Key: "uploads/output.mp3",
      fileName: "output.mp3",
      start_time: 0,
      startTime: 0,
      duration: 6,
    });
  });
});
