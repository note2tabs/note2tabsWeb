type EventPayload = Record<string, any> | undefined;
type QueuedEvent = {
  event_id: string;
  schema_version: number;
  event: string;
  path: string;
  referer: string;
  payload: EventPayload;
  ts: string;
};

export const ANALYTICS_EVENTS = {
  pageView: "page_view",
  ctaClicked: "cta_clicked",
  webVital: "web_vital",
  pricingViewed: "pricing_viewed",
  pricingCtaClicked: "pricing_cta_clicked",
  checkoutStarted: "checkout_started",
  signupStarted: "signup_started",
  signupCompleted: "signup_completed",
  signupFailed: "signup_failed",
  uploadSelected: "upload_selected",
  uploadDropped: "upload_dropped",
  uploadValidationFailed: "upload_validation_failed",
  uploadPresignStarted: "upload_presign_started",
  uploadStorageSucceeded: "upload_storage_succeeded",
  uploadStorageFailed: "upload_storage_failed",
  tabGenerationStarted: "transcribe_start",
  tabGenerationQueued: "transcribe_queued",
  tabGenerationSucceeded: "transcribe_success",
  tabGenerationFailed: "transcribe_error",
} as const;

const FLUSH_DELAY_MS = 1200;
const QUEUE_MAX = 12;

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let idleCancel: (() => void) | null = null;

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function generateEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback below
    }
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

function getUtmParams() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const result: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const value = params.get(key);
    if (value) result[key] = value.slice(0, 160);
  }
  return result;
}

function postEvents(events: QueuedEvent[], useBeacon = false) {
  if (!events.length) return;
  const body = events.length === 1 ? JSON.stringify(events[0]) : JSON.stringify({ events });

  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon("/api/analytics/ingest", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/analytics/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // swallow analytics errors
  });
}

function flush(useBeacon = false) {
  if (!queue.length) return;
  const pending = queue;
  queue = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  idleCancel?.();
  idleCancel = null;
  postEvents(pending, useBeacon);
}

function scheduleFlush() {
  if (flushTimer || idleCancel) return;

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);

  if (typeof window !== "undefined") {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const handle = idleWindow.requestIdleCallback(() => flush(), { timeout: FLUSH_DELAY_MS });
      idleCancel = () => idleWindow.cancelIdleCallback?.(handle);
    }
  }
}

if (typeof window !== "undefined") {
  const flushBeforeUnload = () => flush(true);
  window.addEventListener("pagehide", flushBeforeUnload);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushBeforeUnload();
    }
  });
}

export function sendEvent(event: string, payload?: EventPayload) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  const consent = getCookie("analytics_consent");
  if (consent === "denied") return;

  queue.push({
    event_id: generateEventId(),
    schema_version: 1,
    event,
    path: window.location.pathname,
    referer: document.referrer,
    payload: {
      ...getUtmParams(),
      ...(payload || {}),
    },
    ts: new Date().toISOString(),
  });

  if (queue.length >= QUEUE_MAX) {
    flush();
    return;
  }
  scheduleFlush();
}

export function trackCtaClick(name: string, payload?: EventPayload) {
  sendEvent(ANALYTICS_EVENTS.ctaClicked, { cta: name, ...payload });
}
