type PostHogClient = import("posthog-js").PostHog;
type PostHogProperties = Record<string, unknown>;
type PendingOperation = (client: PostHogClient) => void;

import {
  sanitizeAnalyticsPathname,
  sanitizeAnalyticsProperties,
  sanitizeAnalyticsUrl,
  sanitizePostHogCapture,
} from "./analyticsPrivacy";

const CONSENT_COOKIE = "analytics_consent";
const MAX_PENDING_OPERATIONS = 100;
const IDLE_LOAD_DELAY_MS = 1_800;
const SESSION_REPLAY_BLOCKED_ROUTES = [
  /^\/auth(?:\/|$)/,
  /^\/reset-password(?:\/|$)/,
  /^\/settings(?:\/|$)/,
  /^\/home(?:\/|$)/,
  /^\/mod(?:\/|$)/,
  /^\/admin(?:\/|$)/,
  /^\/tabs(?:\/|$)/,
  /^\/history(?:\/|$)/,
  /^\/job(?:\/|$)/,
  /^\/gte\/?$/,
];

let client: PostHogClient | null = null;
let initPromise: Promise<PostHogClient | null> | null = null;
let identityResetPromise: Promise<void> | null = null;
let scheduled = false;
let pendingOperations: PendingOperation[] = [];
let identifiedUserId: string | null = null;
let identityResetPending = false;
let legacyPersistenceCleared = false;
let trackingDisabledOverride: boolean | null = null;

function getCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function trackingIsDisabled() {
  return trackingDisabledOverride ?? (getCookie(CONSENT_COOKIE) === "denied");
}

function clearLegacyAnalyticsPersistence() {
  if (typeof window === "undefined" || typeof document === "undefined" || legacyPersistenceCleared) return;
  legacyPersistenceCleared = true;

  const storageKeys = (storage: Storage) => {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && (key.startsWith("ph_") || key.startsWith("note2tabs:posthog-"))) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  };

  try {
    storageKeys(window.localStorage);
    storageKeys(window.sessionStorage);
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }

}

function markIdentityResetPending() {
  identityResetPending = true;
  identifiedUserId = null;
}

function completeIdentityReset() {
  identityResetPending = false;
  identifiedUserId = null;
}

function resetPendingIdentity(posthog: PostHogClient) {
  if (!identityResetPending) return;
  posthog.reset();
  completeIdentityReset();
}

export function getPostHogIdentifiedUserId() {
  return identifiedUserId;
}

export function isPostHogIdentityResetPending() {
  return identityResetPending;
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
  clearLegacyAnalyticsPersistence();
  const anonymousDistinctId = getCookie("analytics_anon");

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
        disable_persistence: true,
        disable_capture_url_hashes: true,
        save_referrer: false,
        before_send: sanitizePostHogCapture,
        session_recording: {
          // Editor content and controls are intentionally replayed in full. Sensitive
          // non-editor surfaces opt out with this selector or route-level recording stops.
          blockSelector: ".ph-no-capture, [data-ph-no-capture]",
          maskAllInputs: false,
          maskInputOptions: { password: true },
          recordCrossOriginIframes: false,
          recordHeaders: false,
          recordBody: false,
          captureCanvas: {
            recordCanvas: true,
            canvasFps: 4,
            canvasQuality: "0.4",
          },
          maskCapturedNetworkRequestFn: (request) => ({
            ...request,
            name: sanitizeAnalyticsUrl(request.name),
            requestHeaders: undefined,
            responseHeaders: undefined,
            requestBody: undefined,
            responseBody: undefined,
          }),
        },
        ...(anonymousDistinctId
          ? {
              bootstrap: {
                distinctID: anonymousDistinctId,
                isIdentifiedID: false,
              },
            }
          : {}),
        // Recording starts explicitly after the route has passed the privacy allowlist.
        disable_session_recording: true,
        opt_out_capturing_by_default: trackingIsDisabled(),
      });

      resetPendingIdentity(posthog);
      client = posthog;
      flushPendingOperations(posthog);
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

function sessionReplayIsEnabled() {
  return process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING === "true";
}

export function sessionReplayIsBlocked(url: string) {
  const pathname = sanitizeAnalyticsPathname(url);
  return SESSION_REPLAY_BLOCKED_ROUTES.some((pattern) => pattern.test(pathname));
}

export function stopPostHogSessionRecording() {
  client?.stopSessionRecording();
}

export async function syncPostHogSessionRecording(url: string) {
  if (!sessionReplayIsEnabled() || trackingIsDisabled()) {
    stopPostHogSessionRecording();
    return;
  }
  if (sessionReplayIsBlocked(url)) {
    stopPostHogSessionRecording();
    return;
  }

  const posthog = await initPostHog();
  posthog?.startSessionRecording();
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
  enqueue((posthog) => posthog.capture(event, sanitizedProperties));
  schedulePostHogInit();
}

export function identifyPostHogUser(distinctId: string, properties?: PostHogProperties) {
  if (trackingIsDisabled()) return;
  const sanitizedProperties = properties
    ? sanitizeAnalyticsProperties(properties)
    : undefined;
  identifiedUserId = distinctId;
  enqueue((posthog) => {
    posthog.identify(distinctId, sanitizedProperties);
    identifiedUserId = distinctId;
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
  trackingDisabledOverride = state === "denied";

  if (state === "granted") {
    const posthog = await initPostHog({ ignoreDeniedConsent: true });
    posthog?.opt_in_capturing();
    window.dispatchEvent(new CustomEvent("note2tabs:analytics-consent-changed", { detail: state }));
    return;
  }

  pendingOperations = [];
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
