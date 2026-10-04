const RECOVERY_KEY = "note2tabs:stale-chunk-recovery";
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const RECOVERY_STABLE_MS = 10 * 1000;

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

  // A successful boot means the previous hard reload recovered the app. Keep
  // the marker briefly so simultaneous chunk failures cannot create a reload
  // loop, then clear it so a later, independent network failure can recover.
  const stableTimer = window.setTimeout(() => {
    try {
      window.sessionStorage.removeItem(RECOVERY_KEY);
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
  }, RECOVERY_STABLE_MS);

  const recover = (error: unknown) => {
    if (!isStaleChunkError(error) || reloadStarted) return;

    let lastAttempt = 0;
    try {
      lastAttempt = Number(window.sessionStorage.getItem(RECOVERY_KEY)) || 0;
    } catch {
      // Storage can be unavailable in privacy-restricted browsers. A single
      // in-memory attempt is still safer than leaving the route unusable.
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
      // See storage note above.
    }
    reload();
  };

  const onWindowError = (event: ErrorEvent) => recover(event.error ?? event.message);
  const onUnhandledRejection = (event: PromiseRejectionEvent) => recover(event.reason);

  routerEvents.on("routeChangeError", recover);
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.clearTimeout(stableTimer);
    routerEvents.off("routeChangeError", recover);
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
