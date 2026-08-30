import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => vi.fn()),
}));

vi.mock("@next-auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mocks.findUnique(...args),
      updateMany: (...args: unknown[]) => mocks.updateMany(...args),
    },
  },
}));

vi.mock("../../lib/serverDevMode", () => ({
  isLocalNoDbServerMode: false,
}));

describe("NextAuth session database usage", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.findUnique.mockReset();
    mocks.updateMany.mockReset();
  });

  it("restores a routine session without querying Prisma", async () => {
    const { authOptions } = await import("../../pages/api/auth/[...nextauth]");
    const sessionCallback = authOptions.callbacks?.session;
    const jwtCallback = authOptions.callbacks?.jwt;
    expect(sessionCallback).toBeTypeOf("function");
    expect(jwtCallback).toBeTypeOf("function");

    const session = {
      user: { email: "player@example.com" },
      expires: "2026-08-24T00:00:00.000Z",
    } as Session;
    const token = {
      email: "player@example.com",
      id: "user_1",
      role: "PREMIUM",
      tokensRemaining: 42,
      isEmailVerified: true,
    } as JWT;

    const routineToken = await jwtCallback!({ token } as never);
    const restored = await sessionCallback!({ session, token: routineToken } as never);

    expect(restored.user).toMatchObject({
      id: "user_1",
      role: "PREMIUM",
      tokensRemaining: 42,
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("queries the user only for an explicit session update", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "user_1",
      role: "PREMIUM",
      tokensRemaining: 50,
      emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      emailVerifiedBool: true,
      unverifiedTranscriptionUsed: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const { authOptions } = await import("../../pages/api/auth/[...nextauth]");
    const jwtCallback = authOptions.callbacks?.jwt;
    expect(jwtCallback).toBeTypeOf("function");

    const token = await jwtCallback!({
      token: { email: "player@example.com", role: "FREE" } as JWT,
      trigger: "update",
    } as never);

    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(token).toMatchObject({
      id: "user_1",
      role: "PREMIUM",
      tokensRemaining: 50,
    });
  });

  it("records login and activity timestamps after a successful sign-in", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const { authOptions } = await import("../../pages/api/auth/[...nextauth]");
    const signInCallback = authOptions.callbacks?.signIn;
    expect(signInCallback).toBeTypeOf("function");

    const allowed = await signInCallback!({
      user: { id: "user_1", email: "player@example.com" },
      account: { provider: "credentials" },
    } as never);

    expect(allowed).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        lastLoginAt: expect.any(Date),
        lastActiveAt: expect.any(Date),
      },
    });
  });
});
