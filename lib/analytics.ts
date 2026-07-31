import { capturePostHogEvent } from "./posthogClient";
import { publishTranscriptionCompletedForPremiumPrompt } from "./premiumPromptSignals";
import type { TranscriptionModelChoice } from "./transcriptionModels";
import {
  sanitizeAnalyticsPathname,
  sanitizeAnalyticsProperties,
  sanitizeAnalyticsReferrer,
  sanitizeAnalyticsUrl,
} from "./analyticsPrivacy";

type EventPayload = Record<string, unknown> | undefined;

export const ANALYTICS_EVENTS = {
  pageView: "$pageview",
  ctaClicked: "cta_clicked",
  pricingViewed: "pricing_viewed",
  pricingCtaClicked: "pricing_cta_clicked",
  checkoutStarted: "checkout_started",
  subscriptionStarted: "subscription_started",
  premiumPromptShown: "premium_prompt_shown",
  premiumPromptDismissed: "premium_prompt_dismissed",
  signupStarted: "signup_started",
  signupCompleted: "signup_completed",
  signupFailed: "signup_failed",
  loginSucceeded: "login_succeeded",
  uploadSelected: "upload_selected",
  uploadDropped: "upload_dropped",
  uploadValidationFailed: "upload_validation_failed",
  authHandoffSaved: "auth_handoff_saved",
  authHandoffResumed: "auth_handoff_resumed",
  uploadPresignStarted: "upload_presign_started",
  uploadStorageSucceeded: "upload_storage_succeeded",
  uploadStorageFailed: "upload_storage_failed",
  tabGenerationStarted: "transcription_started",
  transcriptionStartedLightModel: "transcription_started_light_model",
  transcriptionStartedHeavyModel: "transcription_started_heavy_model",
  tabGenerationQueued: "transcription_queued",
  tabGenerationSucceeded: "transcription_succeeded",
  jobCompleted: "job_completed",
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
  const normalizedEvent = LEGACY_EVENT_NAMES[event] || event;
  if (normalizedEvent === ANALYTICS_EVENTS.tabGenerationSucceeded) {
    publishTranscriptionCompletedForPremiumPrompt();
  }
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

  const properties = {
    ...getUtmParams(),
    ...(payload || {}),
  };
  const sanitizedProperties = sanitizeAnalyticsProperties(properties);

  if (normalizedEvent === "$pageview") {
    const pathname = sanitizeAnalyticsPathname(window.location.pathname);
    capturePostHogEvent(normalizedEvent, {
      $current_url: sanitizeAnalyticsUrl(`${window.location.origin}${pathname}`),
      $pathname: pathname,
      $referrer: sanitizeAnalyticsReferrer(document.referrer),
      ...sanitizedProperties,
    });
    return;
  }

  capturePostHogEvent(normalizedEvent, sanitizedProperties);
}

export function getTranscriptionStartedModelEvent(
  transcriptionModel: TranscriptionModelChoice
) {
  return transcriptionModel === "heavy"
    ? ANALYTICS_EVENTS.transcriptionStartedHeavyModel
    : ANALYTICS_EVENTS.transcriptionStartedLightModel;
}

export function sendTranscriptionStartedEvents(
  transcriptionModel: TranscriptionModelChoice,
  payload?: EventPayload
) {
  const properties = { ...(payload || {}), transcriptionModel };
  sendEvent(ANALYTICS_EVENTS.tabGenerationStarted, properties);
  sendEvent(getTranscriptionStartedModelEvent(transcriptionModel), properties);
}

export function trackCtaClick(name: string, payload?: EventPayload) {
  sendEvent(ANALYTICS_EVENTS.ctaClicked, { cta: name, ...payload });
}
