export type GteTelemetryPayload = {
  event: string;
  eventId?: string;
  editorId: string;
  sessionId?: string;
  durationSec?: number;
  activeDurationSec?: number;
  heartbeatSequence?: number;
  mode?: string;
  path?: string;
  ts: string;
};

const FLUSH_MS = 10_000;
const MAX_BATCH = 20;
let queue: GteTelemetryPayload[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function trackingAllowed() {
  return typeof document === "undefined" || !/(?:^|;\s*)analytics_consent=denied(?:;|$)/.test(document.cookie);
}
function scheduleFlush() {
  if (!timer && queue.length) timer = setTimeout(() => void flushGteTelemetry(), FLUSH_MS);
}
export async function flushGteTelemetry(mode: "fetch" | "beacon" = "fetch") {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!trackingAllowed()) { queue = []; return; }
  if (!queue.length) return;
  const events = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ events });
  try {
    if (mode === "beacon" && typeof navigator !== "undefined" && navigator.sendBeacon &&
        navigator.sendBeacon("/api/gte/telemetry", new Blob([body], { type: "application/json" }))) {
      scheduleFlush(); return;
    }
    const response = await fetch("/api/gte/telemetry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true,
    });
    // Invalid payloads cannot recover by retrying. Network/server failures can.
    if (!response.ok && (response.status >= 500 || response.status === 429)) throw new Error("Telemetry unavailable");
  } catch {
    if (trackingAllowed()) queue = [...events, ...queue].slice(0, MAX_BATCH * 5);
  }
  scheduleFlush();
}

export function queueGteTelemetry(payload: Omit<GteTelemetryPayload, "ts"> & { ts?: string }) {
  if (!trackingAllowed()) return Promise.resolve();
  queue.push({ ...payload, eventId: payload.eventId || crypto.randomUUID(), ts: payload.ts || new Date().toISOString() });
  if (queue.length >= MAX_BATCH) return flushGteTelemetry();
  scheduleFlush();
  return Promise.resolve();
}
