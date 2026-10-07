import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/fingerprint", () => ({ generateFingerprint: async () => ({ fingerprintId: "fingerprint" }) }));
vi.mock("../../lib/acquisitionAttribution", () => ({ getAcquisitionProperties: () => ({}), ANALYTICS_ATTRIBUTION_COOKIE: "analytics_first_touch" }));

describe("browser analytics delivery", () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("document", { cookie: "analytics_consent=granted; analytics_anon=anon; analytics_session=session", referrer: "", addEventListener: vi.fn() });
    vi.stubGlobal("window", { location: { protocol: "https:", pathname: "/job/123" }, addEventListener: vi.fn() });
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => false) });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("retries a failed HTTP batch with identical event IDs and timestamps", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const analytics = await import("../../lib/analyticsV2");
    await analytics.track("transcription_imported_to_editor", { job_id: "job", editor_id: "editor" });
    await analytics.flush();
    await analytics.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  });

  it("falls back to keepalive fetch when the browser refuses a beacon", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const analytics = await import("../../lib/analyticsV2");
    await analytics.track("transcription_result_viewed", { job_id: "job" });
    await analytics.flush("pagehide");
    expect(fetch).toHaveBeenCalledWith("/api/analytics/ingest", expect.objectContaining({ keepalive: true }));
  });

  it("clears pending events when the user opts out", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const analytics = await import("../../lib/analyticsV2");
    await analytics.track("transcription_result_viewed");
    analytics.setAnalyticsConsent("denied");
    await analytics.flush();
    expect(fetch).not.toHaveBeenCalled();
  });
});
