import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const ingestMock = vi.fn();
const sessionMock = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../lib/analyticsV2/ingest", () => ({
  ingestAnalyticsEvents: (...args: unknown[]) => ingestMock(...args),
}));

describe("legacy analytics endpoint", () => {
  beforeEach(() => {
    ingestMock.mockReset();
    sessionMock.mockReset();
  });

  it("forwards legacy payload to shared ingest logic", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    ingestMock.mockResolvedValue({ ok: true, received: 1, written: 1, deduped: 0, dualWritten: 1, blocked: 0 });

    const handler = (await import("../../pages/api/analytics/event")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: {
        event: "page_view",
        path: "/",
        payload: { path: "/" },
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    const arg = ingestMock.mock.calls[0][0];
    expect(arg.accountId).toBe("user_1");
    expect(arg.source).toBe("api_event_legacy");
  });
});
