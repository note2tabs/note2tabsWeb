import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const sessionMock = vi.fn();
const logMock = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../lib/gteAnalytics", () => ({
  logGteAnalyticsEvent: (...args: unknown[]) => logMock(...args),
}));

describe("gte telemetry endpoint", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    logMock.mockReset();
  });

  it.each([
    "gte_editor_action",
    "gte_editor_visit",
    "gte_editor_session_start",
    "gte_editor_session_end",
  ] as const)("accepts %s events", async (eventName) => {
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    logMock.mockResolvedValue(undefined);

    const handler = (await import("../../pages/api/gte/telemetry")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: {
        event: eventName,
        editorId: "ed_123",
        sessionId: "sess_123",
        durationSec: 12,
        path: "/gte/ed_123",
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock.mock.calls[0][0]).toMatchObject({
      userId: "user_1",
      event: eventName,
    });
  });

  it("returns 400 for invalid event names", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });

    const handler = (await import("../../pages/api/gte/telemetry")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: {
        event: "gte_editor_created",
        editorId: "ed_123",
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(logMock).not.toHaveBeenCalled();
  });

  it("returns 400 when editorId is missing", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });

    const handler = (await import("../../pages/api/gte/telemetry")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: {
        event: "gte_editor_visit",
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(logMock).not.toHaveBeenCalled();
  });

  it("returns 401 when user is unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);

    const handler = (await import("../../pages/api/gte/telemetry")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: {
        event: "gte_editor_visit",
        editorId: "ed_123",
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
    expect(logMock).not.toHaveBeenCalled();
  });
});
