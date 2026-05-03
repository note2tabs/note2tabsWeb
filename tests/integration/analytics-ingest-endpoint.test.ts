import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const ingestMock = vi.fn();
const sessionMock = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../lib/analyticsV2/ingest", () => ({
  ingestAnalyticsEvents: (...args: unknown[]) => ingestMock(...args),
  isTransientPrismaConnectionError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P1001"),
}));

describe("analytics ingest endpoint", () => {
  beforeEach(() => {
    ingestMock.mockReset();
    sessionMock.mockReset();
  });

  it("soft-fails when analytics storage is temporarily unreachable", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    ingestMock.mockRejectedValue({ code: "P1001", message: "Can't reach database server" });

    const previousNodeEnv = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    try {
      const handler = (await import("../../pages/api/analytics/ingest")).default;
      const { req, res } = createMocks({
        method: "POST",
        body: { events: [{ name: "page_viewed", props: {} }] },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(202);
      expect(JSON.parse(res._getData())).toMatchObject({
        ok: true,
        reason: "analytics_temporarily_unavailable",
      });
    } finally {
      vi.stubEnv("NODE_ENV", previousNodeEnv);
    }
  });
});
