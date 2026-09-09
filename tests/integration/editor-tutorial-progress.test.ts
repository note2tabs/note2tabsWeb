import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mocks.session(...args),
}));
vi.mock("../../lib/prisma", () => ({
  prisma: { user: { updateMany: (...args: unknown[]) => mocks.updateMany(...args) } },
}));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

describe("editor tutorial progress endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks the signed-in user as passed once", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const handler = (await import("../../pages/api/account/tutorial")).default;
    const { req, res } = createMocks({ method: "POST" });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "user_1", passedTutorial: false },
      data: { passedTutorial: true },
    });
  });

  it("does not write progress without an account", async () => {
    mocks.session.mockResolvedValue(null);
    const handler = (await import("../../pages/api/account/tutorial")).default;
    const { req, res } = createMocks({ method: "POST" });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejects other methods", async () => {
    const handler = (await import("../../pages/api/account/tutorial")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });
});
