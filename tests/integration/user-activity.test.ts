import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mocks.session(...args),
}));

vi.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      updateMany: (...args: unknown[]) => mocks.updateMany(...args),
    },
  },
}));

function makeReq(method = "POST") {
  return { method, headers: {} } as NextApiRequest;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    setHeader(name: string, value: unknown) {
      this.headers[name] = value;
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

describe("user activity endpoint", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.session.mockReset();
    mocks.updateMany.mockReset();
  });

  it("requires an authenticated user", async () => {
    mocks.session.mockResolvedValue(null);
    const handler = (await import("../../pages/api/account/activity")).default;
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(401);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("updates activity only when the stored timestamp is stale", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const handler = (await import("../../pages/api/account/activity")).default;
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user_1",
        lastActiveAt: { lt: expect.any(Date) },
      },
      data: { lastActiveAt: expect.any(Date) },
    });
  });
});
