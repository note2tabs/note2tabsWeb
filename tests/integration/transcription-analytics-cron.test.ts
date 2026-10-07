import { afterEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";
const deliver = vi.hoisted(() => vi.fn());
vi.mock("../../lib/transcriptionAnalytics", () => ({ deliverTranscriptionAnalytics: deliver }));
import handler from "../../pages/api/cron/transcription-analytics";
afterEach(() => { vi.unstubAllEnvs(); deliver.mockReset(); });
describe("authenticated analytics scheduler endpoint", () => {
  it("rejects unauthenticated requests", async () => {
    vi.stubEnv("TRANSCRIPTION_ANALYTICS_CRON_SECRET", "secret");
    const { req, res } = createMocks({ method: "POST" }); await handler(req as any, res as any);
    expect(res.statusCode).toBe(401); expect(deliver).not.toHaveBeenCalled();
  });
  it("delivers only for the scheduler's dedicated secret", async () => {
    vi.stubEnv("TRANSCRIPTION_ANALYTICS_CRON_SECRET", "secret"); deliver.mockResolvedValue({ jobs: 2, events: 8 });
    const { req, res } = createMocks({ method: "POST", headers: { authorization: "Bearer secret" } });
    await handler(req as any, res as any); expect(res.statusCode).toBe(200); expect(res._getJSONData()).toEqual({ jobs: 2, events: 8 });
  });
  it("returns a retryable response when PostHog delivery fails", async () => {
    vi.stubEnv("TRANSCRIPTION_ANALYTICS_CRON_SECRET", "secret"); deliver.mockRejectedValue(new Error("Unavailable"));
    const { req, res } = createMocks({ method: "POST", headers: { authorization: "Bearer secret" } });
    await handler(req as any, res as any); expect(res.statusCode).toBe(503);
  });
});
