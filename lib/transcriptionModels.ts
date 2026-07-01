import { durationToCredits } from "./credits";

export type TranscriptionModelChoice = "light" | "heavy";

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelChoice = "heavy";
export const LIGHT_TRANSCRIPTION_BACKEND_METHOD = "basic_pitch";
export const HEAVY_TRANSCRIPTION_BACKEND_METHOD = "yourmt3";
export const TRANSCRIPTION_MODEL_OPTIONS: Array<{
  value: TranscriptionModelChoice;
  label: string;
  description: string;
  creditsPerInterval: number;
}> = [
  {
    value: "heavy",
    label: "Heavy model",
    description: "Most Accurate Model",
    creditsPerInterval: 3,
  },
  {
    value: "light",
    label: "Light model",
    description: "Smaller Legacy Model",
    creditsPerInterval: 2,
  },
];

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
  return "light";
}

export function transcriptionModelToBackendMethod(model: TranscriptionModelChoice) {
  return model === "heavy" ? HEAVY_TRANSCRIPTION_BACKEND_METHOD : LIGHT_TRANSCRIPTION_BACKEND_METHOD;
}

export function getTranscriptionModelOption(model: TranscriptionModelChoice) {
  return (
    TRANSCRIPTION_MODEL_OPTIONS.find((option) => option.value === model) ??
    TRANSCRIPTION_MODEL_OPTIONS.find((option) => option.value === DEFAULT_TRANSCRIPTION_MODEL) ??
    TRANSCRIPTION_MODEL_OPTIONS[0]
  );
}

export function getTranscriptionModelCreditsPerInterval(model: TranscriptionModelChoice) {
  return getTranscriptionModelOption(model).creditsPerInterval;
}

export function calculateTranscriptionCredits(durationSec: number, model: TranscriptionModelChoice) {
  return durationToCredits(durationSec) * getTranscriptionModelCreditsPerInterval(model);
}
