import { durationToCredits } from "./credits";

// "heavy" is the retired Medium id, retained for old saved records.
export type TranscriptionModelChoice = "light" | "heavy" | "super_heavy";
export type TranscriptionModelAnalyticsName = "light" | "medium" | "heavy";

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelChoice = "light";
export const PREMIUM_DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelChoice = "super_heavy";
export const LIGHT_TRANSCRIPTION_BACKEND_METHOD = "msmodel_small";
export const MSMODEL_TRANSCRIPTION_BACKEND_METHOD = "msmodel";
export const HEAVY_PREVIEW_MAX_DURATION_SEC = 30;
export const TRANSCRIPTION_MODEL_OPTIONS: Array<{
  value: TranscriptionModelChoice;
  label: string;
  badge: string;
  description: string;
  creditsPerInterval: number;
}> = [
  {
    value: "light",
    label: "Light model",
    badge: "Lower cost",
    description: "For guitar and multi-instrument recordings.",
    creditsPerInterval: 2,
  },
  {
    value: "super_heavy",
    label: "Heavy model",
    badge: "Premium",
    description: "Our most detailed model for complex multi-instrument recordings.",
    creditsPerInterval: 5,
  },
];

export function transcriptionModelRequiresPremium(model: TranscriptionModelChoice) {
  return model === "super_heavy";
}

export function normalizeTranscriptionModel(value: unknown): TranscriptionModelChoice {
  if (typeof value !== "string") return DEFAULT_TRANSCRIPTION_MODEL;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[-+\s]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (["heavy", "yourmt3", "yourmt3plus", "yourmt3_plus", "mt3", "mt3_plus"].includes(normalized)) {
    return "light";
  }
  if (["super_heavy", "superheavy", "msmodel", "muscriptor"].includes(normalized)) {
    return "super_heavy";
  }
  return "light";
}

export function getDefaultTranscriptionModel(
  isPremium: boolean,
  _heavyPreviewAvailable = false
): TranscriptionModelChoice {
  return isPremium ? PREMIUM_DEFAULT_TRANSCRIPTION_MODEL : DEFAULT_TRANSCRIPTION_MODEL;
}

export function transcriptionModelToBackendMethod(model: TranscriptionModelChoice) {
  if (model === "super_heavy") return MSMODEL_TRANSCRIPTION_BACKEND_METHOD;
  return LIGHT_TRANSCRIPTION_BACKEND_METHOD;
}

export function getTranscriptionModelOption(model: TranscriptionModelChoice) {
  return (
    TRANSCRIPTION_MODEL_OPTIONS.find((option) => option.value === model) ??
    TRANSCRIPTION_MODEL_OPTIONS.find((option) => option.value === DEFAULT_TRANSCRIPTION_MODEL) ??
    TRANSCRIPTION_MODEL_OPTIONS[0]
  );
}

export function getTranscriptionModelAnalyticsName(
  model: TranscriptionModelChoice
): TranscriptionModelAnalyticsName {
  if (model === "super_heavy") return "heavy";
  if (model === "heavy") return "medium";
  return "light";
}

export type TranscriptionBackendMethod = "basic_pitch" | "yourmt3" | "msmodel" | "msmodel_small";

// New requests use the currently deployed implementation, rather than the UI tier.
export function getTranscriptionModelAnalyticsProperties(model: TranscriptionModelChoice) {
  return getRecordedTranscriptionModelAnalyticsProperties(
    model === "heavy" ? "yourmt3" : transcriptionModelToBackendMethod(model), model
  );
}

// Saved jobs must retain the implementation they actually ran. An old Light URL
// without implementation metadata refers to Basic Pitch, never MuScriptor Small.
export function getRecordedTranscriptionModelAnalyticsProperties(
  method: unknown, legacyChoice?: TranscriptionModelChoice | null
) {
  const normalized = typeof method === "string" ? method.toLowerCase().replace(/-/g, "_") : "";
  const implementation: TranscriptionBackendMethod | undefined =
    normalized === "muscriptor" ? "msmodel" :
    normalized === "muscriptor_small" ? "msmodel_small" :
    ["basic_pitch", "yourmt3", "msmodel", "msmodel_small"].includes(normalized)
      ? normalized as TranscriptionBackendMethod :
    legacyChoice === "light" ? "basic_pitch" :
    legacyChoice === "heavy" ? "yourmt3" :
    legacyChoice === "super_heavy" ? "msmodel" : undefined;
  if (!implementation) return {};
  const id = implementation === "msmodel_small" ? "msmodel_small" :
    implementation === "msmodel" ? "super_heavy" :
    implementation === "yourmt3" ? "heavy" : "light";
  const tier = implementation === "msmodel" ? "heavy" : implementation === "yourmt3" ? "medium" : "light";
  return {
    model: id,
    transcriptionModel: id,
    transcription_model_id: id,
    transcription_model_name: tier,
    transcription_model_tier: tier,
    transcription_backend_method: implementation,
    transcription_model_implementation: implementation,
    transcription_model_display_name: implementation === "basic_pitch" ? "Basic Pitch Light" :
      implementation === "msmodel_small" ? "MuScriptor Small Light" :
      implementation === "msmodel" ? "MuScriptor Medium Heavy" : "YourMT3 Medium",
    transcription_analytics_version: "model_implementation_v2",
  };
}

export function getTranscriptionModelCreditsPerInterval(model: TranscriptionModelChoice) {
  return getTranscriptionModelOption(model).creditsPerInterval;
}

export function calculateTranscriptionCredits(durationSec: number, model: TranscriptionModelChoice) {
  return durationToCredits(durationSec) * getTranscriptionModelCreditsPerInterval(model);
}
