import { createAnalyticsQueue, clearAnalyticsQueues, flushAnalyticsQueues, newAnalyticsEventId as randomId } from "./analyticsQueue";
import { businessEventIdentity, clearBusinessEventIdentities } from "./analyticsBusinessEvent";
import { localeAnalytics } from "./i18n/locale";
import { generateFingerprint } from "./fingerprint";
import {
  sanitizeAnalyticsPathname,
  sanitizeAnalyticsProperties,
  sanitizeAnalyticsReferrer,
} from "./analyticsPrivacy";
import { ANALYTICS_ATTRIBUTION_COOKIE, getAcquisitionProperties } from "./acquisitionAttribution";

export const ANALYTICS_CONSENT_COOKIE = "analytics_consent";
export const ANALYTICS_SESSION_COOKIE = "analytics_session";
export const ANALYTICS_ANON_COOKIE = "analytics_anon";

type EventProps = Record<string, unknown>;

type CanonicalEvent = {
  event_id: string;
  schema_version: number;
  name: string;
  ts: string;
  props: EventProps;
  path?: string;
  referrer?: string;
  session_id?: string;
  anon_id?: string;
  app_version?: string;
  fingerprint_id?: string;
};

const QUEUE_MAX = 50;
// Keep events long enough to combine normal navigation/action bursts. Pagehide
// and visibilitychange still flush immediately, so navigation delivery is unchanged.
const FLUSH_MS = 60_000;

let fingerprintPromise: Promise<string | undefined> | null = null;
let resolvedFingerprintId: string | undefined;

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string, maxAgeSec: number) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + maxAgeSec * 1000).toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; Max-Age=${maxAgeSec}; path=/; SameSite=Lax${secure}`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; expires=${new Date(0).toUTCString()}; path=/; SameSite=Lax`;
}

function shouldTrack() {
  if (typeof document === "undefined") return false;
  const consent = getCookie(ANALYTICS_CONSENT_COOKIE);
  // Analytics is enabled by default; an explicit Settings opt-out is authoritative.
  return consent !== "denied";
}

function ensureIds() {
  let sessionId = getCookie(ANALYTICS_SESSION_COOKIE);
  let anonId = getCookie(ANALYTICS_ANON_COOKIE);
  if (!sessionId) {
    sessionId = randomId();
    setCookie(ANALYTICS_SESSION_COOKIE, sessionId, 24 * 60 * 60);
  }
  if (!anonId) {
    anonId = randomId();
    setCookie(ANALYTICS_ANON_COOKIE, anonId, 90 * 24 * 60 * 60);
  }
  return { sessionId, anonId };
}

export function getAnalyticsTrackingIds() {
  if (typeof window === "undefined" || !shouldTrack()) return null;
  return ensureIds();
}

async function getFingerprintId() {
  if (fingerprintPromise) return fingerprintPromise;
  fingerprintPromise = (async () => {
    try {
      const { fingerprintId } = await generateFingerprint();
      resolvedFingerprintId = fingerprintId;
      return fingerprintId;
    } catch {
      return undefined;
    }
  })();
  return fingerprintPromise;
}

async function postEvents(events: CanonicalEvent[], mode: "fetch" | "beacon") {
  if (!events.length) return true;
  const payload = JSON.stringify({ events });

  if (mode === "beacon" && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon("/api/analytics/ingest", blob)) return false;
  }

  const response = await fetch("/api/analytics/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  });
  if (!response.ok && (response.status >= 500 || response.status === 429 || !response.status)) throw new Error("Analytics delivery failed");
  return true;
}

const delivery = createAnalyticsQueue<CanonicalEvent>({
  key: "n2t:analytics-pending:v1", batchSize: QUEUE_MAX, delay: FLUSH_MS,
  allowed: shouldTrack, id: e => e.event_id, timestamp: e => e.ts, send: postEvents,
});
export async function flush(reason: "timer" | "manual" | "pagehide" = "manual") {
  await delivery.flush(reason === "pagehide" ? "beacon" : "fetch");
}

export async function track(name: string, props: EventProps = {}) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!shouldTrack()) return;

  const { sessionId, anonId } = ensureIds();
  // Queue navigation events immediately. Waiting for fingerprint generation can
  // let a link navigation unload the page before the event reaches the queue.
  // Fingerprinting warms in the background and is attached to later events.
  void getFingerprintId();
  const eventProps = sanitizeAnalyticsProperties({
    ...getAcquisitionProperties(),
    ...localeAnalytics(window.location.pathname),
    ...props,
  });

  const businessIdentity = businessEventIdentity(name, props);
  const event: CanonicalEvent = {
    event_id: businessIdentity.event_id || randomId(),
    schema_version: 2,
    name,
    ts: businessIdentity.ts || new Date().toISOString(),
    props: eventProps,
    path: sanitizeAnalyticsPathname(window.location.pathname),
    referrer: document.referrer
      ? sanitizeAnalyticsReferrer(document.referrer)
      : undefined,
    session_id: sessionId,
    anon_id: anonId,
    fingerprint_id: resolvedFingerprintId,
  };

  await delivery.enqueue(event);
}

export function trackPageView(path?: string) {
  void track("page_viewed", {
    path: sanitizeAnalyticsPathname(
      path || (typeof window !== "undefined" ? window.location.pathname : undefined)
    ),
  });
}

export function trackTranscriptionStarted(props: EventProps = {}) {
  void track("transcription_started", props);
}

export function trackTranscriptionSucceeded(props: EventProps = {}) {
  void track("transcription_succeeded", props);
}

export function trackTranscriptionFailed(props: EventProps = {}) {
  void track("transcription_failed", props);
}

export function trackGteEditorViewed(props: EventProps = {}) {
  void track("gte_editor_viewed", props);
}

export function trackGteSessionStarted(props: EventProps = {}) {
  void track("gte_session_started", props);
}

export function trackGteSessionEnded(props: EventProps = {}) {
  void track("gte_session_ended", props);
}

export function getAnalyticsOwnerId() {
  try { const owner = JSON.parse(getCookie("analytics_owner") || "null"); return owner?.anonId === getCookie(ANALYTICS_ANON_COOKIE) && typeof owner?.userId === "string" ? owner.userId as string : null; }
  catch { return null; }
}

export async function resetAnalyticsIdentity() {
  await flushAnalyticsQueues();
  if (!shouldTrack()) return;
  deleteCookie("analytics_owner");
  deleteCookie(ANALYTICS_ANON_COOKIE);
  deleteCookie(ANALYTICS_SESSION_COOKIE);
  if (shouldTrack()) ensureIds();
}

export function setAnalyticsConsent(state: "granted" | "denied") {
  setCookie(ANALYTICS_CONSENT_COOKIE, state, 365 * 24 * 60 * 60);
  if (state === "denied") {
    clearBusinessEventIdentities();
    clearAnalyticsQueues();
    deleteCookie("analytics_owner");
    deleteCookie(ANALYTICS_ANON_COOKIE);
    deleteCookie(ANALYTICS_SESSION_COOKIE);
    deleteCookie(ANALYTICS_ATTRIBUTION_COOKIE);
  } else {
    ensureIds();
  }
}

if (typeof window !== "undefined") {
  const flushOnHide = () => {
    void flush("pagehide");
  };
  window.addEventListener("pagehide", flushOnHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushOnHide();
    }
  });
}
