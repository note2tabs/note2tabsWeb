import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserLoadDiagnostics, clearBrowserLoadDiagnostics, observeResourceFailure, recordChunkRecoveryDecision } from "../../lib/browserLoadDiagnostics";
import { sanitizeAnalyticsProperties } from "../../lib/analyticsPrivacy";

const exception = (url = "/_next/static/chunks/1olvm4xc0lc6e.js?token=secret") => [{ value: `Failed to load chunk ${url} from module 10783` }];
const resourceError = (src: string) => ({ target: { tagName: "SCRIPT", src } }) as unknown as Event;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  clearBrowserLoadDiagnostics();
  vi.stubGlobal("window", { location: { origin: "https://www.note2tabs.com", pathname: "/gte/private-id" }, performance: {
    now: () => 1300,
    getEntriesByType: (type: string) => type === "navigation" ? [{ type: "navigate" }] : [{ name: "https://www.note2tabs.com/_next/static/chunks/1olvm4xc0lc6e.js?token=secret", startTime: 1000, duration: 250.4, transferSize: 300, encodedBodySize: 20, responseStatus: 404 }],
  } });
  vi.stubGlobal("navigator", { onLine: true, connection: { effectiveType: "4g", rtt: 70, saveData: false } });
  vi.stubGlobal("document", { visibilityState: "visible" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("browser load diagnostics", () => {
  it("recreates the alerted chunk payload with matched resource failure and HTTP timing", () => {
    observeResourceFailure(resourceError("https://www.note2tabs.com/_next/static/chunks/1olvm4xc0lc6e.js?token=secret"));
    recordChunkRecoveryDecision("reload_started");
    const result = sanitizeAnalyticsProperties(browserLoadDiagnostics(exception()));
    expect(result).toMatchObject({ diagnostic_path: "/gte/[editor_id]", browser_online: true, page_visibility: "visible", network_effective_type: "4g", network_rtt_ms: 70, chunk_recovery_decision: "reload_started", failed_build_assets: [{path: "/_next/static/chunks/1olvm4xc0lc6e.js", resource_error_observed: true, timing_available: true, duration_ms: 250, http_status: 404}] });
    expect(JSON.stringify(result)).not.toMatch(/secret|private-id/);
  });
  it("does not attach unrelated resource errors or leak arbitrary asset URLs", () => {
    observeResourceFailure(resourceError("https://www.note2tabs.com/private/audio.mp3?email=secret@example.com"));
    observeResourceFailure(resourceError("https://www.note2tabs.com/_next/static/chunks/other.js"));
    expect(browserLoadDiagnostics(exception()).failed_build_assets).toEqual([expect.objectContaining({resource_error_observed: false})]);
    expect(browserLoadDiagnostics(exception("https://external.example/_next/static/chunks/private.js")).failed_build_assets).toEqual([]);
    expect(browserLoadDiagnostics([{value: "Failed to fetch https://private.example/token"}]).failed_build_assets).toEqual([]);
  });
  it("keeps missing status unknown and works without resource timing or connection APIs", () => {
    delete (window as unknown as {performance?: unknown}).performance;
    vi.stubGlobal("navigator", { onLine: false });
    const result = browserLoadDiagnostics(exception());
    expect(result).toMatchObject({browser_online: false, failed_build_assets: [{path: "/_next/static/chunks/1olvm4xc0lc6e.js", timing_available: false}]});
    expect(JSON.stringify(result)).not.toContain("http_status");
  });
  it("does not treat responseStatus zero as a measured HTTP error", () => {
    window.performance.getEntriesByType = () => [{name: "https://www.note2tabs.com/_next/static/chunks/1olvm4xc0lc6e.js", startTime: 1000, responseStatus: 0}] as unknown as PerformanceEntryList;
    expect(JSON.stringify(browserLoadDiagnostics(exception()))).not.toContain("http_status");
  });
  it("does not mistake a previous successful download for the failed request", () => {
    window.performance.getEntriesByType = () => [{name: "https://www.note2tabs.com/_next/static/chunks/1olvm4xc0lc6e.js", startTime: -60_000, responseStatus: 200}] as unknown as PerformanceEntryList;
    expect(browserLoadDiagnostics(exception()).failed_build_assets).toEqual([expect.objectContaining({timing_available: false})]);
  });
  it("expires old correlations and clears diagnostics on opt-out", () => {
    observeResourceFailure(resourceError("https://www.note2tabs.com/_next/static/chunks/1olvm4xc0lc6e.js"));
    recordChunkRecoveryDecision("retry_guard_blocked");
    vi.advanceTimersByTime(30_001);
    expect(browserLoadDiagnostics(exception()).chunk_recovery_decision).toBeUndefined();
    expect(browserLoadDiagnostics(exception()).failed_build_assets).toEqual([expect.objectContaining({resource_error_observed: false})]);
    recordChunkRecoveryDecision("reload_started");
    clearBrowserLoadDiagnostics();
    expect(browserLoadDiagnostics(exception()).chunk_recovery_decision).toBeUndefined();
  });
  it("never prevents capture when browser APIs throw", () => {
    vi.stubGlobal("navigator", { get onLine() { throw new Error("blocked"); } });
    expect(() => browserLoadDiagnostics(exception())).not.toThrow();
  });
});
