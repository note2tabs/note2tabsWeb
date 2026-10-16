import type { UploadFailureDetails } from "./transcriptionUpload";
import { ANALYTICS_EVENTS, sendEvent } from "./analytics";
import { getTranscriptionModelAnalyticsProperties, type TranscriptionModelChoice } from "./transcriptionModels";

export type SubmissionBlockReason =
  | "already_in_progress" | "session_loading" | "sign_in_required" | "email_unverified"
  | "missing_file" | "invalid_youtube_url" | "missing_clip_range" | "invalid_clip_range"
  | "clip_duration_limit" | "file_too_large" | "file_preservation_limit"
  | "invalid_file_clip_range" | "negative_clip_start" | "clip_start_out_of_bounds"
  | "invalid_clip_end" | "clip_end_out_of_bounds" | "preview_confirmation_required"
  | "auth_handoff_failed" | "auth_navigation_failed" | "saved_upload_missing" | "auth_resume_failed"
  | "entitlement_pending" | "credits_exhausted" | "server_rejected" | "request_failed" | "invalid_response";
export type SubmissionBlockStage = "preflight" | "validation" | "authentication" | "auth_handoff" | "auth_resume" | "confirmation" | "server" | "request" | "upload_presign" | "upload_storage";
export type SubmissionBlockDetails = UploadFailureDetails & {
  clip_start_sec?: number;
  clip_end_sec?: number;
  limit_bytes?: number;
  limit_seconds?: number;
  file_size_bytes?: number;
  file_type?: string;
  mode?: "FILE" | "YOUTUBE";
  http_status?: number;
  request_id?: string;
};
type SubmissionContext = {
  surface: "home_transcriber" | "transcriber";
  mode: "FILE" | "YOUTUBE";
  model: TranscriptionModelChoice;
  plan: string;
  signedIn: boolean;
  sessionStatus: string;
  file: Pick<File, "size" | "type"> | null;
  clipStart: number | null;
  clipEnd: number | null;
};
const numeric = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const fileCategory = (type: string | undefined) => {
  if (!type) return "unknown";
  if (/^(audio\/(x-)?midi|application\/(x-)?midi)$/i.test(type)) return "midi";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  return "other";
};

/** Product friction, not an exception alert. Never collect filenames, URLs or file contents. */
export function trackBlockedTranscriptionSubmission(
  context: SubmissionContext,
  reason: SubmissionBlockReason,
  stage: SubmissionBlockStage,
  details: SubmissionBlockDetails = {},
) {
  const mode = details.mode || context.mode;
  const clipStart = details.clip_start_sec ?? context.clipStart;
  const clipEnd = details.clip_end_sec ?? context.clipEnd;
  const technical = ["auth_handoff_failed", "auth_navigation_failed", "auth_resume_failed", "request_failed", "server_rejected", "invalid_response"].includes(reason);
  try {
    sendEvent(ANALYTICS_EVENTS.transcriptionSubmissionBlocked, {
      blocked_reason: reason,
      blocked_stage: stage,
      is_expected_gate: !technical,
      blocking_version: 1,
      surface: context.surface,
      mode,
      subscription_plan: context.plan.toLowerCase(),
      signed_in: context.signedIn,
      session_status: context.sessionStatus,
      has_file: mode === "FILE" && (context.file !== null || details.file_size_bytes !== undefined),
      file_size_bytes: mode === "FILE" ? numeric(details.file_size_bytes ?? context.file?.size) : undefined,
      file_category: mode === "FILE" ? fileCategory(details.file_type ?? context.file?.type) : undefined,
      clip_start_sec: numeric(clipStart),
      clip_end_sec: numeric(clipEnd),
      clip_duration_sec: clipStart !== null && clipEnd !== null ? numeric(clipEnd - clipStart) : undefined,
      limit_bytes: numeric(details.limit_bytes),
      limit_seconds: numeric(details.limit_seconds),
      http_status: numeric(details.http_status),
      request_id: details.request_id,
      storage_error_code: details.storage_error_code,
      storage_error_reason: details.storage_error_reason,
      upload_failure_kind: details.upload_failure_kind,
      upload_attempt: numeric(details.upload_attempt),
      upload_elapsed_ms: numeric(details.upload_elapsed_ms),
      upload_browser_online: details.upload_browser_online,
      ...getTranscriptionModelAnalyticsProperties(context.model),
    });
  } catch {
    // Telemetry must never interrupt the existing validation, upgrade or sign-in flow.
  }
}
