import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
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
  isLocalNoDbServerMode: false,
}));

vi.mock("../../lib/backendCredits", async () => {
  const actual = await vi.importActual<typeof import("../../lib/backendCredits")>("../../lib/backendCredits");
  return {
    ...actual,
    raiseBackendCreditsToFloor: (...args: unknown[]) => mocks.raiseBackendCreditsToFloor(...args),
  };
});

function makeReq() {
  return {
    method: "GET",
    headers: {},
  } as NextApiRequest;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader() {
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

async function callCredits(role: string, storedRemaining: number, backendRemaining: number, plan?: string) {
  const handler = (await import("../../pages/api/credits")).default;
  mocks.session.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: "user_1",
    role,
    subscriptionPlan: plan ?? (role === "PREMIUM" ? "PREMIUM" : "FREE"),
    tokensRemaining: storedRemaining,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  mocks.prisma.tabJob.groupBy.mockResolvedValue([]);
  mocks.raiseBackendCreditsToFloor.mockResolvedValue(backendRemaining);

  const res = makeRes();
  await handler(makeReq(), res);
  return res;
}

describe("credits role refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.session.mockReset();
    mocks.raiseBackendCreditsToFloor.mockReset();
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.user.update.mockReset();
    mocks.prisma.user.updateMany.mockReset();
    mocks.prisma.tabJob.groupBy.mockReset();
  });

  it.each(["ADMIN", "MODERATOR", "MOD"])("preserves the existing staff cap for %s", async (role) => {
    const res = await callCredits(role, 150, 150);
    expect(res.statusCode).toBe(200);
    expect((res.body as { credits: { remaining: number } }).credits.remaining).toBe(150);
    expect(mocks.raiseBackendCreditsToFloor.mock.calls[0][3]).toBe(200);
    expect(mocks.prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("preserves a Pro rollover balance above the old cap", async () => {
    const res = await callCredits("PREMIUM", 750, 750, "PRO");
    expect(res.statusCode).toBe(200);
    expect((res.body as { credits: { remaining: number } }).credits.remaining).toBe(750);
    expect(mocks.raiseBackendCreditsToFloor.mock.calls[0][3]).toBe(1000);
    expect(mocks.prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("does not ask backend credits for free users", async () => {
    const res = await callCredits("FREE", 7, 10);

    expect(res.statusCode).toBe(200);
    expect(mocks.raiseBackendCreditsToFloor).not.toHaveBeenCalled();
    expect((res.body as { credits: { remaining: number } }).credits.remaining).toBe(10);
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user_1",
        role: "FREE",
        subscriptionPlan: "FREE",
        tokensRemaining: 7,
      },
      data: { tokensRemaining: 10 },
    });
  });

  it("does not restore admin credits from a higher backend remaining balance", async () => {
    const res = await callCredits("ADMIN", 7, 10);

    expect(res.statusCode).toBe(200);
    expect(mocks.raiseBackendCreditsToFloor).toHaveBeenCalled();
    expect((res.body as { credits: { remaining: number } }).credits.remaining).toBe(7);
    expect(mocks.prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("does lower admin credits from a lower backend remaining balance", async () => {
    const res = await callCredits("ADMIN", 10, 7);

    expect(res.statusCode).toBe(200);
    expect(mocks.raiseBackendCreditsToFloor).toHaveBeenCalled();
    expect((res.body as { credits: { remaining: number } }).credits.remaining).toBe(7);
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user_1",
        role: "ADMIN",
        subscriptionPlan: "FREE",
        tokensRemaining: 10,
      },
      data: { tokensRemaining: 7 },
    });
  });
});
