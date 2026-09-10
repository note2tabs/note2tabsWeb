import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const mocks = vi.hoisted(() => ({ read: vi.fn(), block: vi.fn() }));
vi.mock("../../lib/tabShareEmailPreferences", () => ({
  readTabShareBlockToken: (...args: unknown[]) => mocks.read(...args),
  blockTabShareEmails: (...args: unknown[]) => mocks.block(...args),
}));

import handler from "../../pages/api/email/block-tab-shares";

describe("tab share email blocking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockReturnValue("player@example.com");
    mocks.block.mockResolvedValue(undefined);
  });

  it("stores a valid recipient preference", async () => {
    const { req, res } = createMocks({ method: "POST", body: { token: "opaque-token" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mocks.block).toHaveBeenCalledWith("player@example.com");
  });

  it("rejects invalid tokens and other methods", async () => {
    mocks.read.mockReturnValue(null);
    const invalid = createMocks({ method: "POST", body: { token: "bad" } });
    await handler(invalid.req, invalid.res);
    expect(invalid.res._getStatusCode()).toBe(400);

    const wrongMethod = createMocks({ method: "GET" });
    await handler(wrongMethod.req, wrongMethod.res);
    expect(wrongMethod.res._getStatusCode()).toBe(405);
  });
});
