type PostHogClient = import("posthog-js").PostHog;
type PostHogProperties = Record<string, unknown>;
type PendingOperation = (client: PostHogClient) => void;

import {
  sanitizeAnalyticsProperties,
  sanitizePostHogCapture,
} from "./analyticsPrivacy";

const CONSENT_COOKIE = "analytics_consent";
const MAX_PENDING_OPERATIONS = 100;
const MAX_PERSISTED_EVENTS = 30;
const IDLE_LOAD_DELAY_MS = 1_800;
const PENDING_EVENTS_KEY = "note2tabs:posthog-pending-events";
const IDENTIFIED_USER_KEY = "note2tabs:posthog-identified-user";
const IDENTITY_RESET_PENDING_KEY = "note2tabs:posthog-identity-reset-pending";
const PAGE_INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

type PersistedEvent = {
  pageInstanceId: string;
  event: string;
  properties?: PostHogProperties;
};

let client: PostHogClient | null = null;
let initPromise: Promise<PostHogClient | null> | null = null;
let identityResetPromise: Promise<void> | null = null;
let scheduled = false;
let pendingOperations: PendingOperation[] = [];

function getCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function trackingIsDisabled() {
  return getCookie(CONSENT_COOKIE) !== "granted";
}

function getLocalStorageValue(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocalStorageValue(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Analytics state must never interrupt the product experience.
  }
}

function removeLocalStorageValue(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Analytics state must never interrupt the product experience.
  }
}

function markIdentityResetPending() {
  setLocalStorageValue(IDENTITY_RESET_PENDING_KEY, "1");
  removeLocalStorageValue(IDENTIFIED_USER_KEY);
}

function completeIdentityReset() {
  removeLocalStorageValue(IDENTITY_RESET_PENDING_KEY);
  removeLocalStorageValue(IDENTIFIED_USER_KEY);
}

function resetPendingIdentity(posthog: PostHogClient) {
  if (getLocalStorageValue(IDENTITY_RESET_PENDING_KEY) !== "1") return;
  posthog.reset();
  completeIdentityReset();
}

export function getPostHogIdentifiedUserId() {
  return getLocalStorageValue(IDENTIFIED_USER_KEY);
}

export function isPostHogIdentityResetPending() {
  return getLocalStorageValue(IDENTITY_RESET_PENDING_KEY) === "1";
}

function readPersistedEvents(): PersistedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PENDING_EVENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(-MAX_PERSISTED_EVENTS) : [];
  } catch {
    return [];
  }
}

function persistEvent(event: string, properties?: PostHogProperties) {
  if (typeof window === "undefined" || trackingIsDisabled()) return;
  try {
    const events = readPersistedEvents();
    events.push({ pageInstanceId: PAGE_INSTANCE_ID, event, properties });
    window.sessionStorage.setItem(
      PENDING_EVENTS_KEY,
      JSON.stringify(events.slice(-MAX_PERSISTED_EVENTS))
    );
  } catch {
    // Analytics persistence must never interrupt the product experience.
  }
}

function takeCarriedEvents() {
  if (typeof window === "undefined") return [];
  const events = readPersistedEvents().filter((event) => event.pageInstanceId !== PAGE_INSTANCE_ID);
  try {
    window.sessionStorage.removeItem(PENDING_EVENTS_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  return events;
}

function flushPendingOperations(posthog: PostHogClient) {
  const operations = pendingOperations;
  pendingOperations = [];
  operations.forEach((operation) => {
    try {
      operation(posthog);
    } catch {
      // Analytics must never interrupt the product experience.
    }
  });
}

export async function initPostHog(options: { ignoreDeniedConsent?: boolean } = {}) {
  if (typeof window === "undefined") return client;
  if (client) {
    if (trackingIsDisabled() && !options.ignoreDeniedConsent) {
      client.opt_out_capturing();
      return null;
    }
    resetPendingIdentity(client);
    return client;
  }

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token || (trackingIsDisabled() && !options.ignoreDeniedConsent)) return null;
  if (initPromise) return initPromise;

  initPromise = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(token, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
        defaults: "2026-05-30",
        capture_pageview: false,
        capture_pageleave: true,
        capture_exceptions: false,
        autocapture: true,
        person_profiles: "identified_only",
        disable_capture_url_hashes: true,
        save_referrer: false,
        before_send: sanitizePostHogCapture,
        disable_session_recording:
          process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING !== "true",
        opt_out_capturing_by_default: trackingIsDisabled(),
        persistence: "localStorage+cookie",
      });

      resetPendingIdentity(posthog);
      client = posthog;
      takeCarriedEvents().forEach((pendingEvent) => {
        posthog.capture(pendingEvent.event, pendingEvent.properties);
      });
      flushPendingOperations(posthog);
      try {
        window.sessionStorage.removeItem(PENDING_EVENTS_KEY);
      } catch {
        // Ignore unavailable storage.
      }
      return posthog;
    })
    .catch(() => {
      scheduled = false;
      return null;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

function enqueue(operation: PendingOperation) {
  if (trackingIsDisabled()) return;
  if (client) {
    operation(client);
    return;
  }
  if (pendingOperations.length >= MAX_PENDING_OPERATIONS) pendingOperations.shift();
  pendingOperations.push(operation);
}

export function capturePostHogEvent(event: string, properties?: PostHogProperties) {
  const sanitizedProperties = properties
    ? sanitizeAnalyticsProperties(properties)
    : undefined;
  if (!client) persistEvent(event, sanitizedProperties);
  enqueue((posthog) => posthog.capture(event, sanitizedProperties));
  schedulePostHogInit();
}

export function identifyPostHogUser(distinctId: string, properties?: PostHogProperties) {
  if (trackingIsDisabled()) return;
  const sanitizedProperties = properties
    ? sanitizeAnalyticsProperties(properties)
    : undefined;
  setLocalStorageValue(IDENTIFIED_USER_KEY, distinctId);
  enqueue((posthog) => {
    posthog.identify(distinctId, sanitizedProperties);
    setLocalStorageValue(IDENTIFIED_USER_KEY, distinctId);
  });
  schedulePostHogInit();
}

export function resetPostHogIdentity() {
  if (identityResetPromise) return identityResetPromise;

  markIdentityResetPending();
  identityResetPromise = (async () => {
    // reset() clears PostHog's opt-out value. Leave the persistent reset
    // marker in place until analytics is permitted again instead.
    if (trackingIsDisabled()) return;

    if (client) {
      client.reset();
      completeIdentityReset();
      return;
    }

    const posthog = await initPostHog();
    if (!posthog) return;
    posthog.reset();
    completeIdentityReset();
  })()
    .catch(() => {
      // The persistent marker makes a later initialization retry the reset.
    })
    .finally(() => {
      identityResetPromise = null;
    });

  return identityResetPromise;
}

export function schedulePostHogInit() {
  if (scheduled || typeof window === "undefined" || trackingIsDisabled()) return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  scheduled = true;

  let delayId: number | undefined;
  let idleId: number | undefined;
  const start = () => {
    if (delayId) window.clearTimeout(delayId);
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("keydown", start);
    void initPostHog();
  };

  window.addEventListener("pointerdown", start, { once: true, passive: true });
  window.addEventListener("keydown", start, { once: true });
  delayId = window.setTimeout(() => {
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(start, { timeout: 1_000 });
    } else {
      start();
    }
  }, IDLE_LOAD_DELAY_MS);

  return () => {
    if (delayId) window.clearTimeout(delayId);
    if (idleId && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("keydown", start);
  };
}

export async function setPostHogConsent(state: "granted" | "denied") {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

  if (state === "granted") {
    const posthog = await initPostHog({ ignoreDeniedConsent: true });
    posthog?.opt_in_capturing();
    window.dispatchEvent(new CustomEvent("note2tabs:analytics-consent-changed", { detail: state }));
    return;
  }

  pendingOperations = [];
  try {
    window.sessionStorage.removeItem(PENDING_EVENTS_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  markIdentityResetPending();
  const posthog = client || (await initPostHog({ ignoreDeniedConsent: true }));
  if (posthog) {
    // reset() clears PostHog's own consent value, so opt out must be last.
    posthog.reset();
    posthog.opt_out_capturing();
    completeIdentityReset();
  }
  window.dispatchEvent(new CustomEvent("note2tabs:analytics-consent-changed", { detail: state }));
}
