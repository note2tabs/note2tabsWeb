import { getPostHog } from "./posthogClient";

type EventPayload = Record<string, unknown> | undefined;

export const ANALYTICS_EVENTS = {
  pageView: "$pageview",
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
  tabGenerationStarted: "transcription_started",
  tabGenerationQueued: "transcription_queued",
  tabGenerationSucceeded: "transcription_succeeded",
  tabGenerationFailed: "transcription_failed",
  transcriptionEditorImportStarted: "transcription_editor_import_started",
  transcriptionImportedToEditor: "transcription_imported_to_editor",
  transcriptionEditorImportFailed: "transcription_editor_import_failed",
} as const;

function getUtmParams() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const result: Record<string, string> = {};
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ]) {
    const value = params.get(key);
    if (value) result[key] = value.slice(0, 160);
  }
  return result;
}

const LEGACY_EVENT_NAMES: Record<string, string> = {
  page_view: "$pageview",
  transcribe_start: "transcription_started",
  transcribe_queued: "transcription_queued",
  transcribe_success: "transcription_succeeded",
  transcribe_error: "transcription_failed",
};

export function sendEvent(event: string, payload?: EventPayload) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

  const normalizedEvent = LEGACY_EVENT_NAMES[event] || event;
  const properties = {
    ...getUtmParams(),
    ...(payload || {}),
  };

  if (normalizedEvent === "$pageview") {
    getPostHog().capture(normalizedEvent, {
      $current_url: window.location.href,
      $pathname: window.location.pathname,
      ...properties,
    });
    return;
  }

  getPostHog().capture(normalizedEvent, properties);
}

export function trackCtaClick(name: string, payload?: EventPayload) {
  sendEvent(ANALYTICS_EVENTS.ctaClicked, { cta: name, ...payload });
}
