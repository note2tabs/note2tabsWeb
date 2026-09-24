import { durationToCredits } from "./credits";

export type TranscriptionModelChoice = "light" | "heavy" | "super_heavy";
export type TranscriptionModelAnalyticsName = "light" | "medium" | "heavy";

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelChoice = "light";
export const PREMIUM_DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelChoice = "heavy";
export const LIGHT_TRANSCRIPTION_BACKEND_METHOD = "basic_pitch";
export const HEAVY_TRANSCRIPTION_BACKEND_METHOD = "yourmt3";
// Keep the legacy backend wire value until every deployed backend accepts
// "msmodel"; the frontend name is intentionally vendor-neutral.
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
    badge: "Faster",
    description: "Best for clear, focused guitar recordings.",
    creditsPerInterval: 2,
  },
  {
    value: "heavy",
    label: "Medium model",
    badge: "More accurate",
    description: "Best for complex and multi-instrument recordings.",
    creditsPerInterval: 3,
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
    return "heavy";
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
  return model === "heavy" ? HEAVY_TRANSCRIPTION_BACKEND_METHOD : LIGHT_TRANSCRIPTION_BACKEND_METHOD;
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

export function getTranscriptionModelAnalyticsProperties(model: TranscriptionModelChoice) {
  return {
    // `transcriptionModel` is retained for compatibility with existing insights.
    transcriptionModel: model,
    transcription_model_id: model,
    transcription_model_name: getTranscriptionModelAnalyticsName(model),
  } as const;
}

export function getTranscriptionModelCreditsPerInterval(model: TranscriptionModelChoice) {
  return getTranscriptionModelOption(model).creditsPerInterval;
}

export function calculateTranscriptionCredits(durationSec: number, model: TranscriptionModelChoice) {
  return durationToCredits(durationSec) * getTranscriptionModelCreditsPerInterval(model);
}
