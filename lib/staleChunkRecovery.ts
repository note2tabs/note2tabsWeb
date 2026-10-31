import { sanitizeAnalyticsPathname } from "./analyticsPrivacy";
import { rememberChunkRecovery } from "./chunkRecoveryOutcome";
import { recordChunkRecoveryDecision } from "./browserLoadDiagnostics";

const RECOVERY_KEY = "note2tabs:stale-chunk-recovery";
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const RECOVERY_HISTORY_KEY = "note2tabs:chunk-recovery-destinations";
const MAX_RECOVERY_DESTINATIONS = 3;
type RecoveryAttempt = {path: string; at: number};

function recentAttempts(raw: string | null, now: number): RecoveryAttempt[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed) || parsed.length > MAX_RECOVERY_DESTINATIONS) return [];
    return parsed.filter((entry): entry is RecoveryAttempt => Boolean(entry &&
      typeof entry.path === "string" && entry.path.startsWith("/") && entry.path.length <= 160 &&
      !/[?#]/.test(entry.path) && Number.isFinite(entry.at) && entry.at > 0 &&
      now - entry.at >= 0 && now - entry.at < RECOVERY_WINDOW_MS));
  } catch { return []; }
}

const STALE_CHUNK_PATTERNS = [
  /chunkloaderror/i,
  /loading chunk [^ ]+ failed/i,
  /failed to load chunk/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
];

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name} ${value.message}`;
  if (value && typeof value === "object") {
    const candidate = value as { name?: unknown; message?: unknown; reason?: unknown };
    return [candidate.name, candidate.message, candidate.reason]
      .map((item) => errorText(item))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

export function isStaleChunkError(value: unknown) {
  const text = errorText(value);
  return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(text));
}

type RecoveryDependencies = {
  now?: () => number;
  reload?: () => void;
  navigate?: (path: string) => void;
  reportFailure?: () => void;
};

export function installStaleChunkRecovery(
  routerEvents: {
    on: (event: "routeChangeError", handler: (error: unknown, targetPath?: string) => void) => void;
    off: (event: "routeChangeError", handler: (error: unknown, targetPath?: string) => void) => void;
  },
  dependencies: RecoveryDependencies = {}
) {
  const now = dependencies.now ?? Date.now;
  const reload = dependencies.reload ?? (() => window.location.reload());
  const navigate = dependencies.navigate ?? ((path: string) => window.location.assign(path));
  let reloadStarted = false;

  // Booting does not prove the failed route's chunks loaded. Keep the timestamp
  // across reloads for the entire guard window; an expired attempt is replaced
  // when a later, independent failure needs recovery.

  const recover = (error: unknown, targetPath?: string) => {
    if (!isStaleChunkError(error) || reloadStarted) return;

    // Resolve the intended route before consulting the guard. A successful
    // reload of login must not disable recovery of a later signup navigation.
    let destination: string | undefined;
    let recoveryPath = "/";
    try {
      const current = new URL(window.location.href);
      let target = current;
      if (typeof targetPath === "string") {
        const candidate = new URL(targetPath, current);
        if (candidate.origin === current.origin) target = candidate;
      }
      recoveryPath = sanitizeAnalyticsPathname(target.pathname.replace(/\/$/, "") || "/");
      if (target.href !== current.href) destination = target.href;
    } catch { /* Invalid/external destinations fall back to a guarded reload. */ }

    const timestamp = now();
    let lastAttempt = 0;
    let attempts: RecoveryAttempt[];
    try {
      lastAttempt = Number(window.sessionStorage.getItem(RECOVERY_KEY)) || 0;
      attempts = recentAttempts(window.sessionStorage.getItem(RECOVERY_HISTORY_KEY), timestamp);
    } catch {
      reloadStarted = true;
      recordChunkRecoveryDecision("storage_unavailable");
      dependencies.reportFailure?.();
      return;
    }

    // Keep compatibility with attempts made before destination history existed.
    // Scope new attempts per route, and cap the total to prevent redirect loops.
    const legacyGuard = lastAttempt > 0 && timestamp - lastAttempt < RECOVERY_WINDOW_MS && !attempts.length;
    if (legacyGuard || attempts.some(attempt => attempt.path === recoveryPath) || attempts.length >= MAX_RECOVERY_DESTINATIONS) {
      reloadStarted = true;
      recordChunkRecoveryDecision("retry_guard_blocked");
      dependencies.reportFailure?.();
      return;
    }

    reloadStarted = true;
    try {
      window.sessionStorage.setItem(RECOVERY_HISTORY_KEY, JSON.stringify([...attempts, {path: recoveryPath, at: timestamp}]));
      window.sessionStorage.setItem(RECOVERY_KEY, String(timestamp));
    } catch {
      recordChunkRecoveryDecision("storage_write_failed");
      dependencies.reportFailure?.();
      return;
    }
    const attemptId = rememberChunkRecovery(error, destination);
    recordChunkRecoveryDecision("reload_started", attemptId);
    if (destination) navigate(destination);
    else reload();
  };

  const onWindowError = (event: ErrorEvent) => recover(event.error ?? event.message);
  const onUnhandledRejection = (event: PromiseRejectionEvent) => recover(event.reason);

  routerEvents.on("routeChangeError", recover);
  window.addEventListener("error", onWindowError, true);
  window.addEventListener("unhandledrejection", onUnhandledRejection, true);

  return () => {
    routerEvents.off("routeChangeError", recover);
    window.removeEventListener("error", onWindowError, true);
    window.removeEventListener("unhandledrejection", onUnhandledRejection, true);
  };
}
