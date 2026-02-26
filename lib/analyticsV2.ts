import { generateFingerprint } from "./fingerprint";

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

const QUEUE_MAX = 20;
const FLUSH_MS = 1200;

let queue: CanonicalEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let fingerprintPromise: Promise<string | undefined> | null = null;

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

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

function shouldTrack() {
  if (typeof document === "undefined") return false;
  const consent = getCookie(ANALYTICS_CONSENT_COOKIE);
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

async function getFingerprintId() {
  if (fingerprintPromise) return fingerprintPromise;
  fingerprintPromise = (async () => {
    try {
      const { fingerprintId } = await generateFingerprint();
      return fingerprintId;
    } catch {
      return undefined;
    }
  })();
  return fingerprintPromise;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush("timer");
  }, FLUSH_MS);
}

async function postEvents(events: CanonicalEvent[], mode: "fetch" | "beacon") {
  if (!events.length) return;
  const payload = JSON.stringify({ events });

  if (mode === "beacon" && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/ingest", blob);
    return;
  }

  await fetch("/api/analytics/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  });
}

export async function flush(reason: "timer" | "manual" | "pagehide" = "manual") {
  if (!queue.length) return;
  const pending = queue;
  queue = [];
  try {
    await postEvents(pending, reason === "pagehide" ? "beacon" : "fetch");
  } catch {
    // Never throw from analytics client.
  }
}

export async function track(name: string, props: EventProps = {}) {
  if (typeof window === "undefined") return;
  if (!shouldTrack()) return;

  const { sessionId, anonId } = ensureIds();
  const fingerprintId = await getFingerprintId();

  const event: CanonicalEvent = {
    event_id: randomId(),
    schema_version: 2,
    name,
    ts: new Date().toISOString(),
    props,
    path: window.location.pathname,
    referrer: document.referrer || undefined,
    session_id: sessionId,
    anon_id: anonId,
    fingerprint_id: fingerprintId,
  };

  queue.push(event);
  if (queue.length >= QUEUE_MAX) {
    void flush("manual");
    return;
  }
  scheduleFlush();
}

export function trackPageView(path?: string) {
  void track("page_viewed", {
    path: path || (typeof window !== "undefined" ? window.location.pathname : undefined),
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

export function setAnalyticsConsent(state: "granted" | "denied") {
  setCookie(ANALYTICS_CONSENT_COOKIE, state, 365 * 24 * 60 * 60);
  if (state === "denied") {
    deleteCookie(ANALYTICS_ANON_COOKIE);
    deleteCookie(ANALYTICS_SESSION_COOKIE);
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
