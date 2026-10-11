const RECOVERY_KEY = "note2tabs:stale-chunk-recovery";
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;

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
  reportFailure?: () => void;
};

export function installStaleChunkRecovery(
  routerEvents: {
    on: (event: "routeChangeError", handler: (error: unknown) => void) => void;
    off: (event: "routeChangeError", handler: (error: unknown) => void) => void;
  },
  dependencies: RecoveryDependencies = {}
) {
  const now = dependencies.now ?? Date.now;
  const reload = dependencies.reload ?? (() => window.location.reload());
  let reloadStarted = false;

  // Booting does not prove the failed route's chunks loaded. Keep the timestamp
  // across reloads for the entire guard window; an expired attempt is replaced
  // when a later, independent failure needs recovery.

  const recover = (error: unknown) => {
    if (!isStaleChunkError(error) || reloadStarted) return;

    let lastAttempt = 0;
    try {
      lastAttempt = Number(window.sessionStorage.getItem(RECOVERY_KEY)) || 0;
    } catch {
      // Without persistent storage, each new page would lose the retry guard.
      // Report the failure instead of risking an unbounded hard-reload loop.
      reloadStarted = true;
      dependencies.reportFailure?.();
      return;
    }

    if (lastAttempt > 0 && now() - lastAttempt < RECOVERY_WINDOW_MS) {
      // A failed page can reject several chunk promises at once. Report that
      // recovery failure once instead of turning one incident into many alerts.
      reloadStarted = true;
      dependencies.reportFailure?.();
      return;
    }

    reloadStarted = true;
    try {
      window.sessionStorage.setItem(RECOVERY_KEY, String(now()));
    } catch {
      dependencies.reportFailure?.();
      return;
    }
    reload();
  };

  const onWindowError = (event: ErrorEvent) => recover(event.error ?? event.message);
  const onUnhandledRejection = (event: PromiseRejectionEvent) => recover(event.reason);

  routerEvents.on("routeChangeError", recover);
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    routerEvents.off("routeChangeError", recover);
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
