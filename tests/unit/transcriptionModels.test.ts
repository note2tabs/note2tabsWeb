import { describe, expect, it } from "vitest";
import {
  calculateTranscriptionCredits,
  getDefaultTranscriptionModel,
  getTranscriptionModelAnalyticsName,
  getTranscriptionModelAnalyticsProperties,
  normalizeTranscriptionModel,
  transcriptionModelToBackendMethod,
  transcriptionModelRequiresPremium,
} from "../../lib/transcriptionModels";

describe("transcription models", () => {
  it("defaults missing values to the light model", () => {
    expect(normalizeTranscriptionModel(undefined)).toBe("light");
  });

  it("defaults paid users to the Heavy model without changing the free default", () => {
    expect(getDefaultTranscriptionModel(true)).toBe("super_heavy");
    expect(getDefaultTranscriptionModel(false)).toBe("light");
  });

  it("keeps Light selected until the user actively chooses the Heavy preview", () => {
    expect(getDefaultTranscriptionModel(false, true)).toBe("light");
  });

  it("keeps legacy backend values on the light model", () => {
    expect(normalizeTranscriptionModel("basic_pitch")).toBe("light");
  });

  it("normalizes YourMT3 aliases to the user-facing Medium model", () => {
    expect(normalizeTranscriptionModel("heavy")).toBe("heavy");
    expect(normalizeTranscriptionModel("yourmt3+")).toBe("heavy");
    expect(normalizeTranscriptionModel("mt3-plus")).toBe("heavy");
  });

  it("maps backend-compatible identifiers to current analytics names", () => {
    expect(getTranscriptionModelAnalyticsName("light")).toBe("light");
    expect(getTranscriptionModelAnalyticsName("heavy")).toBe("medium");
    expect(getTranscriptionModelAnalyticsName("super_heavy")).toBe("heavy");
  });

  it("preserves the legacy id while exposing the current product name", () => {
    expect(getTranscriptionModelAnalyticsProperties("heavy")).toEqual({
      transcriptionModel: "heavy",
      transcription_model_id: "heavy",
      transcription_model_name: "medium",
    });
    expect(getTranscriptionModelAnalyticsProperties("super_heavy")).toEqual({
      transcriptionModel: "super_heavy",
      transcription_model_id: "super_heavy",
      transcription_model_name: "heavy",
    });
  });

  it("maps user-facing model choices to backend transcription methods", () => {
    expect(transcriptionModelToBackendMethod("light")).toBe("basic_pitch");
    expect(transcriptionModelToBackendMethod("heavy")).toBe("yourmt3");
  });

  it("charges Light at 2, Medium at 3, and Heavy at 5 credits per interval", () => {
    expect(calculateTranscriptionCredits(30, "light")).toBe(2);
    expect(calculateTranscriptionCredits(30, "heavy")).toBe(3);
    expect(calculateTranscriptionCredits(31, "light")).toBe(4);
    expect(calculateTranscriptionCredits(31, "heavy")).toBe(6);
    expect(calculateTranscriptionCredits(30, "super_heavy")).toBe(5);
    expect(calculateTranscriptionCredits(31, "super_heavy")).toBe(10);
  });

  it("reserves only the user-facing Heavy model for Premium and Pro", () => {
    expect(transcriptionModelRequiresPremium("light")).toBe(false);
    expect(transcriptionModelRequiresPremium("heavy")).toBe(false);
    expect(transcriptionModelRequiresPremium("super_heavy")).toBe(true);
  });
});
