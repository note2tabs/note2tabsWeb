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
  isEmailVerificationRequiredServer: false,
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
  req.headers = { "content-type": "application/json" };
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

async function callTranscribe(role: string) {
  const handler = (await import("../../pages/api/transcribe")).default;
  mocks.session.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: "user_1",
    role,
    tokensRemaining: 10,
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    emailVerifiedBool: true,
    unverifiedTranscriptionUsed: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  mocks.prisma.tabJob.groupBy.mockResolvedValue([]);
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
    startTime: 0,
    duration: 30,
    transcriptionModel: "heavy",
    separateGuitar: false,
    multipleGuitars: false,
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
});
