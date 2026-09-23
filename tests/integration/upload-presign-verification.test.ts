import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mocks.session(...args),
}));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("../../lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => mocks.findUser(...args) } },
}));
vi.mock("../../lib/serverDevMode", () => ({
  isEmailVerificationRequiredServer: true,
  isLocalNoDbServerMode: false,
}));

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string | string[]>,
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

describe("signed upload verification gate", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.session.mockReset();
    mocks.findUser.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("does not allocate upload storage for an unverified account", async () => {
    const handler = (await import("../../pages/api/uploads/presign")).default;
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.findUser.mockResolvedValue({
      role: "FREE",
      subscriptionPlan: "FREE",
      emailVerified: null,
      emailVerifiedBool: false,
    });
    const req = {
      method: "POST",
      body: { fileName: "song.mp3", contentType: "audio/mpeg", size: 1024 },
    } as NextApiRequest;
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ verificationRequired: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
