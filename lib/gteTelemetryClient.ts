export type GteTelemetryPayload = {
  event: string;
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

export function flushGteTelemetry(mode: "fetch" | "beacon" = "fetch") {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length) return Promise.resolve();
  const events = queue;
  queue = [];
  const body = JSON.stringify({ events });
  if (mode === "beacon" && typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/gte/telemetry", new Blob([body], { type: "application/json" }));
    return Promise.resolve();
  }
  return fetch("/api/gte/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).then(() => undefined).catch(() => undefined);
}

export function queueGteTelemetry(payload: Omit<GteTelemetryPayload, "ts"> & { ts?: string }) {
  queue.push({ ...payload, ts: payload.ts || new Date().toISOString() });
  if (queue.length >= MAX_BATCH) return flushGteTelemetry();
  if (!timer) timer = setTimeout(() => void flushGteTelemetry(), FLUSH_MS);
  return Promise.resolve();
}
