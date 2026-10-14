import { sanitizeAnalyticsPathname } from "./analyticsPrivacy";
import { diagnosticTrackingEnabled } from "./errorBreadcrumbs";
const KEY = "note2tabs:chunk-recovery-context";
const MAX_AGE = 5 * 60_000;

type Attempt = { id: string; at: number; path: string; assets: string[] };
export function forgetChunkRecoveryOutcome() {
  try { window.sessionStorage.removeItem(KEY); } catch { /* optional diagnostics */ }
}
export function rememberChunkRecovery(error: unknown, path?: string) {
  if (!diagnosticTrackingEnabled()) return;
  try {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const assets = [...new Set(message.match(/\/_next\/static\/[a-zA-Z0-9_./-]+\.(?:js|css)/g) ?? [])].slice(0, 5);
    const attempt: Attempt = { id: crypto.randomUUID(), at: Date.now(), path: sanitizeAnalyticsPathname(path || window.location.pathname), assets };
    window.sessionStorage.setItem(KEY, JSON.stringify(attempt));
    return attempt.id;
  } catch { return; }
}
export function reportChunkRecoveryOutcome(report: (details: Record<string, unknown>) => void) {
  if (!diagnosticTrackingEnabled()) return () => {};
  let failed = false;
  const onError = () => { failed = true; };
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onError, true);
  const timer = window.setTimeout(() => {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      forgetChunkRecoveryOutcome();
      if (!raw || !diagnosticTrackingEnabled()) return;
      const attempt = JSON.parse(raw) as Attempt;
      if (!Number.isFinite(attempt.at) || Date.now() - attempt.at < 0 || Date.now() - attempt.at > MAX_AGE || !/^[a-f0-9-]{36}$/.test(attempt.id)) return;
      const samePath = sanitizeAnalyticsPathname(window.location.pathname) === attempt.path;
      const resources = window.performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const assetsLoaded = Array.isArray(attempt.assets) && attempt.assets.length > 0 && attempt.assets.length <= 5 && attempt.assets.every(path =>
        /^\/_next\/static\/[a-zA-Z0-9_./-]+\.(?:js|css)$/.test(path) && resources.some(entry => {
          const url = new URL(entry.name, window.location.origin);
          return url.origin === window.location.origin && url.pathname === path && entry.encodedBodySize > 0;
        }));
      report({ recovery_attempt_id: attempt.id, recovery_elapsed_ms: Date.now() - attempt.at, recovery_same_path: samePath, recovery_assets_loaded: assetsLoaded,
        recovery_outcome: failed ? "page_error_after_reload" : !samePath ? "different_page_mounted" : assetsLoaded ? "page_mounted_assets_loaded" : "page_mounted_unverified_assets" });
    } catch { /* Missing storage/performance data is not evidence of recovery. */ }
    finally { cleanupListeners(); }
  }, 2000);
  function cleanupListeners() {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onError, true);
  }
  return () => { window.clearTimeout(timer); cleanupListeners(); };
}
