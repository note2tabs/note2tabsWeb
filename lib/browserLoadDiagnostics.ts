import { sanitizeAnalyticsPathname } from "./analyticsPrivacy";

type ResourceFailure = { url: string; at: number };
const failures: ResourceFailure[] = [];
let recovery: { decision: string; at: number; attemptId?: string } | undefined;

/** Only application build assets; never arbitrary request URLs or query strings. */
function buildAsset(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !/^\/_next\/static\/[a-zA-Z0-9_./-]+\.(?:js|css)$/.test(url.pathname)) return;
    return url.pathname;
  } catch { return; }
}

export function clearBrowserLoadDiagnostics() {
  failures.length = 0;
  recovery = undefined;
}

export function observeResourceFailure(event: Event) {
  // Resource errors do not bubble, so the caller installs a capture listener.
  const target = event.target as HTMLScriptElement | HTMLLinkElement | null;
  if (!target || (target.tagName !== "SCRIPT" && target.tagName !== "LINK")) return;
  const url = buildAsset(target.tagName === "SCRIPT" ? (target as HTMLScriptElement).src : (target as HTMLLinkElement).href);
  if (!url) return;
  failures.push({ url, at: Date.now() });
  if (failures.length > 10) failures.shift();
}

export function recordChunkRecoveryDecision(decision: string, attemptId?: string) {
  recovery = { decision, at: Date.now(), attemptId };
}

/** Bounded, best-effort metadata. Missing timings/statuses remain unknown, never inferred. */
export function browserLoadDiagnostics(exceptions: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  try {
    result.diagnostic_version = 1;
    result.diagnostic_path = sanitizeAnalyticsPathname(window.location.pathname);
    result.browser_online = navigator.onLine;
    result.page_visibility = document.visibilityState;
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean } }).connection;
    if (connection) {
      if (["slow-2g", "2g", "3g", "4g"].includes(connection.effectiveType ?? "")) result.network_effective_type = connection.effectiveType;
      if (typeof connection.saveData === "boolean") result.network_save_data = connection.saveData;
      if (Number.isFinite(connection.rtt)) result.network_rtt_ms = connection.rtt;
    }
    const performanceApi = window.performance;
    const navigation = performanceApi?.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation) result.navigation_type = navigation.type;
    if (performanceApi) result.page_age_ms = Math.round(performanceApi.now());
    if (recovery && Date.now() - recovery.at < 30_000) {
      result.chunk_recovery_decision = recovery.decision;
      if (recovery.attemptId) result.recovery_attempt_id = recovery.attemptId;
    }

    const assets = new Set<string>();
    if (Array.isArray(exceptions)) {
      for (const exception of exceptions.slice(0, 5)) {
        if (typeof exception?.value !== "string") continue;
        // Extract only build asset references, not whole error messages.
        const matches = exception.value.slice(0, 8_000).match(/(?:https?:\/\/[^\s"'<>()[\]]+)?\/_next\/static\/[a-zA-Z0-9_./-]+\.(?:js|css)(?:\?[^\s"'<>()[\]]*)?/g) ?? [];
        for (const match of matches) { const asset = buildAsset(match); if (asset) assets.add(asset); }
      }
    }
    // Do not annotate an unrelated error with a previous resource failure.
    result.failed_build_assets = [...assets].slice(0, 5).map(path => {
      const failure = [...failures].reverse().find(item => item.url === path && Date.now() - item.at < 30_000);
      const timing = (performanceApi?.getEntriesByType("resource") as PerformanceResourceTiming[] | undefined)
        ?.filter(item => buildAsset(item.name) === path
          && item.startTime <= performanceApi!.now()
          && performanceApi!.now() - item.startTime < 30_000).at(-1);
      const resource: Record<string, unknown> = { path, resource_error_observed: Boolean(failure), timing_available: Boolean(timing) };
      if (failure) resource.resource_error_age_ms = Date.now() - failure.at;
      if (timing) {
        resource.timing_age_ms = Math.round(performanceApi!.now() - timing.startTime);
        resource.duration_ms = Math.round(timing.duration);
        resource.transfer_bytes = timing.transferSize;
        resource.encoded_bytes = timing.encodedBodySize;
        // 0 means unavailable, not HTTP success or proof that the visitor was offline.
        const status = (timing as PerformanceResourceTiming & { responseStatus?: number }).responseStatus;
        if (typeof status === "number" && status >= 100 && status <= 599) resource.http_status = status;
      }
      return resource;
    });
  } catch { /* Diagnostics must never prevent exception capture. */ }
  return result;
}
