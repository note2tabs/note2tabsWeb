import type { LimitContext } from "./limitUpgrade";
import { PLAN_CATALOG } from "./subscriptionPlans";

export function limitPopupTracking(reason: string, context: LimitContext) {
  const limitType = reason.includes("file_size") ? "file_size"
    : reason === "youtube_duration_limit" ? "youtube_length"
    : reason === "file_duration_limit" ? "file_length"
    : reason === "heavy_model_locked" ? "model_access"
    : context.remaining === 0 ? "credits_exhausted"
    : (context.required || 0) > (context.remaining || 0) ? "insufficient_credits"
    : "credits_low";
  return {
    popup_type: "transcription_limit",
    popup_version: "priced_limit_v2",
    limit_type: limitType,
    limit_reason: reason,
    current_plan: context.plan.toLowerCase(),
    credits_remaining: context.remaining,
    credits_required: context.required,
    file_size_bytes: context.fileBytes,
    upload_limit_bytes: limitType === "file_size" ? PLAN_CATALOG[context.plan].maxUploadBytes : undefined,
    selected_duration_seconds: context.clipSeconds,
    duration_limit_seconds: limitType === "youtube_length" ? (context.plan === "FREE" ? 30 : PLAN_CATALOG[context.plan].youtubePositionLimitSeconds) : limitType === "file_length" ? 60 : undefined,
  };
}
