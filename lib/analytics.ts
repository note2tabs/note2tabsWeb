import { publishTranscriptionCompletedForPremiumPrompt } from "./premiumPromptSignals";
import { track as trackAnalyticsV2 } from "./analyticsV2";
import {
  getTranscriptionModelAnalyticsProperties,
  type TranscriptionModelChoice,
} from "./transcriptionModels";
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
  checkoutRequested: "checkout_session_requested",
  checkoutRedirected: "checkout_redirected",
  checkoutFailed: "checkout_failed",
  checkoutClientFailed: "checkout_client_failed",
  subscriptionStarted: "subscription_started",
  subscriptionCheckoutConfirmed: "subscription_checkout_confirmed",
  premiumTrialActivationShown: "premium_trial_activation_shown",
  premiumTrialActivationLanded: "premium_trial_activation_landed",
  premiumWelcomeViewed: "premium_welcome_viewed",
  premiumWelcomeCtaClicked: "premium_welcome_cta_clicked",
  subscriptionPaymentRecoveryShown: "subscription_payment_recovery_shown",
  subscriptionPaymentRecoveryClicked: "subscription_payment_recovery_clicked",
  subscriptionPaymentRecoveryFailed: "subscription_payment_recovery_failed",
  subscriptionCancellationRecoveryClicked: "subscription_cancellation_recovery_clicked",
  subscriptionCancellationRecoveryFailed: "subscription_cancellation_recovery_failed",
  subscriptionManagementOpened: "subscription_management_opened",
  subscriptionCancellationIntentStarted: "subscription_cancellation_intent_started",
  subscriptionCancellationGoalSelected: "subscription_cancellation_goal_selected",
  subscriptionCancellationAlternativeClicked: "subscription_cancellation_alternative_clicked",
  subscriptionCancellationContinued: "subscription_cancellation_continued",
  premiumPromptShown: "premium_prompt_shown",
  premiumPromptClicked: "premium_prompt_clicked",
  premiumPromptDismissed: "premium_prompt_dismissed",
  signupStarted: "signup_started",
  signupCompleted: "signup_completed",
  signupFailed: "signup_failed",
  emailVerified: "email_verified",
  tabShareEmailClicked: "tab_share_email_clicked",
  tabShareEmailSignupCompleted: "tab_share_email_signup_completed",
  tabShareDialogOpened: "tab_share_dialog_opened",
  loginSucceeded: "login_succeeded",
  inactiveSignupReminderLanded: "inactive_signup_reminder_landed",
  tabReturnReminderLanded: "tab_return_reminder_landed",
  productHomeViewed: "product_home_viewed",
  retentionIntentPromptShown: "retention_intent_prompt_shown",
  retentionIntentSelected: "retention_intent_selected",
  retentionIntentPromptDismissed: "retention_intent_prompt_dismissed",
  uploadSelected: "upload_selected",
  uploadDropped: "upload_dropped",
  uploadValidationFailed: "upload_validation_failed",
  authHandoffRequired: "auth_handoff_required",
  authHandoffSaved: "auth_handoff_saved",
  authHandoffResumed: "auth_handoff_resumed",
  uploadPresignStarted: "upload_presign_started",
  uploadStorageSucceeded: "upload_storage_succeeded",
  uploadStorageFailed: "upload_storage_failed",
  tabGenerationStarted: "transcription_started",
  transcriptionStartedLightModel: "transcription_started_light_model",
  transcriptionStartedMediumModel: "transcription_started_medium_model",
  transcriptionStartedHeavyModel: "transcription_started_heavy_model",
  heavyPreviewShown: "heavy_preview_shown",
  heavyPreviewConfirmationShown: "heavy_preview_confirmation_shown",
  heavyPreviewSelected: "heavy_preview_selected",
  heavyPreviewConfirmationDismissed: "heavy_preview_confirmation_dismissed",
  heavyPreviewStarted: "heavy_preview_started",
  heavyPreviewCompleted: "heavy_preview_completed",
  heavyPreviewUpgradeShown: "heavy_preview_upgrade_shown",
  heavyPreviewUpgradeClicked: "heavy_preview_upgrade_clicked",
  heavyPreviewUpgradeDismissed: "heavy_preview_upgrade_dismissed",
  verificationGateShown: "verification_gate_shown",
  tabGenerationQueued: "transcription_queued",
  tabGenerationSucceeded: "transcription_succeeded",
  jobCompleted: "job_completed",
  tabGenerationFailed: "transcription_failed",
  transcriptionEditorImportStarted: "transcription_editor_import_started",
  transcriptionImportedToEditor: "transcription_imported_to_editor",
  transcriptionEditorImportFailed: "transcription_editor_import_failed",
  accountDeletionStarted: "account_deletion_started",
  accountDeletionGoalSelected: "account_deletion_goal_selected",
  accountDeletionAlternativeClicked: "account_deletion_alternative_clicked",
  accountDeletionConfirmed: "account_deletion_confirmed",
  internshipApplicationSubmitted: "internship_application_submitted",
  staleChunkRecoveryFailed: "stale_chunk_recovery_failed",
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
  const properties = {
    ...getUtmParams(),
    ...(payload || {}),
  };
  const sanitizedProperties = sanitizeAnalyticsProperties(properties);

  if (normalizedEvent === "$pageview") {
    const pathname = sanitizeAnalyticsPathname(window.location.pathname);
    void trackAnalyticsV2("page_viewed", {
      current_url: sanitizeAnalyticsUrl(`${window.location.origin}${pathname}`),
      pathname,
      $referrer: sanitizeAnalyticsReferrer(document.referrer),
      ...sanitizedProperties,
    });
    return;
  }

  void trackAnalyticsV2(normalizedEvent, sanitizedProperties);
}

export function getTranscriptionStartedModelEvent(
  transcriptionModel: TranscriptionModelChoice
) {
  if (transcriptionModel === "super_heavy") {
    return ANALYTICS_EVENTS.transcriptionStartedHeavyModel;
  }
  if (transcriptionModel === "heavy") {
    return ANALYTICS_EVENTS.transcriptionStartedMediumModel;
  }
  return ANALYTICS_EVENTS.transcriptionStartedLightModel;
}

export function sendTranscriptionStartedEvents(
  transcriptionModel: TranscriptionModelChoice,
  payload?: EventPayload
) {
  const properties = {
    ...(payload || {}),
    ...getTranscriptionModelAnalyticsProperties(transcriptionModel),
  };
  sendEvent(ANALYTICS_EVENTS.tabGenerationStarted, properties);
  sendEvent(getTranscriptionStartedModelEvent(transcriptionModel), properties);
}

export function trackCtaClick(name: string, payload?: EventPayload) {
  sendEvent(ANALYTICS_EVENTS.ctaClicked, { cta: name, ...payload });
}
