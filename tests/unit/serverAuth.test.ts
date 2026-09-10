import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mocks.findUnique(...args),
    },
  },
}));

describe("fresh server authorization", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
  });

  it("uses the current database role instead of a stale elevated JWT role", async () => {
    mocks.findUnique.mockResolvedValue({ role: "FREE" });
    const { hasFreshUserRole } = await import("../../lib/serverAuth");
    const session = {
      user: { id: "user_1", role: "ADMIN" },
      expires: "2026-08-24T00:00:00.000Z",
    } as Session;

    await expect(hasFreshUserRole(session, new Set(["ADMIN"]))).resolves.toBe(false);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "user_1" },
      select: { role: true, subscriptionPlan: true },
    });
  });

  it("accepts a freshly verified elevated role", async () => {
    mocks.findUnique.mockResolvedValue({ role: "ADMIN" });
    const { hasFreshUserRole } = await import("../../lib/serverAuth");
    const session = {
      user: { id: "user_1", role: "FREE" },
      expires: "2026-08-24T00:00:00.000Z",
    } as Session;

    await expect(hasFreshUserRole(session, new Set(["ADMIN"]))).resolves.toBe(true);
  });
});
