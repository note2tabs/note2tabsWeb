import { createAnalyticsQueue, newAnalyticsEventId } from "./analyticsQueue";
import { getAnalyticsTrackingIds } from "./analyticsV2";
export type GteTelemetryPayload = {
  event: string;
  eventId?: string;
  anonId?: string;
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
function trackingAllowed() {
  return typeof document === "undefined" || !/(?:^|;\s*)analytics_consent=denied(?:;|$)/.test(document.cookie);
}
const delivery = createAnalyticsQueue<GteTelemetryPayload>({
  key: "n2t:gte-pending:v1", batchSize: MAX_BATCH, delay: FLUSH_MS,
  allowed: trackingAllowed, id: e => e.eventId!, timestamp: e => e.ts,
  async send(events, mode) {
    const body = JSON.stringify({events});
    if (mode === "beacon" && typeof navigator !== "undefined" && navigator.sendBeacon &&
      navigator.sendBeacon("/api/gte/telemetry", new Blob([body], {type: "application/json"}))) return false;
    const response = await fetch("/api/gte/telemetry", {method: "POST", headers: {"Content-Type": "application/json"}, body, keepalive: true});
    if (!response.ok && (response.status >= 500 || response.status === 429)) throw new Error("Telemetry unavailable");
    return true;
  },
});
export function flushGteTelemetry(mode: "fetch" | "beacon" = "fetch") { return delivery.flush(mode); }
export function queueGteTelemetry(payload: Omit<GteTelemetryPayload, "ts"> & {ts?: string}) {
  if (!trackingAllowed()) {delivery.clear(); return Promise.resolve();}
  return delivery.enqueue({...payload, eventId: payload.eventId || newAnalyticsEventId(),
    anonId: payload.anonId || getAnalyticsTrackingIds()?.anonId, ts: payload.ts || new Date().toISOString()});
}
