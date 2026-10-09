import { describe, expect, it } from "vitest";
import {
  calculateTranscriptionCredits,
  getDefaultTranscriptionModel,
  getTranscriptionModelAnalyticsName,
  getTranscriptionModelAnalyticsProperties,
  getRecordedTranscriptionModelAnalyticsProperties,
  normalizeTranscriptionModel,
  TRANSCRIPTION_MODEL_OPTIONS,
  transcriptionModelToBackendMethod,
  transcriptionModelRequiresPremium,
} from "../../lib/transcriptionModels";

describe("transcription models", () => {
  it("offers only Light and Heavy, both backed by MuScriptor", () => {
    expect(TRANSCRIPTION_MODEL_OPTIONS.map(option => option.value)).toEqual(["light", "super_heavy"]);
    expect(transcriptionModelToBackendMethod("super_heavy")).toBe("msmodel");
  });
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

  it("maps retired Medium selections to Light", () => {
    expect(normalizeTranscriptionModel("heavy")).toBe("light");
    expect(normalizeTranscriptionModel("yourmt3+")).toBe("light");
    expect(normalizeTranscriptionModel("mt3-plus")).toBe("light");
  });

  it("maps backend-compatible identifiers to current analytics names", () => {
    expect(getTranscriptionModelAnalyticsName("light")).toBe("light");
    expect(getTranscriptionModelAnalyticsName("heavy")).toBe("medium");
    expect(getTranscriptionModelAnalyticsName("super_heavy")).toBe("heavy");
  });

  it("preserves the legacy id while exposing the current product name", () => {
    expect(getTranscriptionModelAnalyticsProperties("heavy")).toMatchObject({
      transcriptionModel: "heavy",
      transcription_model_id: "heavy",
      transcription_model_name: "medium",
    });
    expect(getTranscriptionModelAnalyticsProperties("super_heavy")).toMatchObject({
      transcriptionModel: "super_heavy",
      transcription_model_id: "super_heavy",
      transcription_model_name: "heavy",
    });
  });

  it("keeps historical Basic Pitch distinct from new MuScriptor Light", () => {
    const current = getTranscriptionModelAnalyticsProperties("light");
    const historical = getRecordedTranscriptionModelAnalyticsProperties("basic_pitch", "light");
    expect(current).toMatchObject({ transcriptionModel: "msmodel_small", transcription_model_id: "msmodel_small", transcription_backend_method: "msmodel_small", transcription_model_tier: "light" });
    expect(historical).toMatchObject({ transcriptionModel: "light", transcription_model_id: "light", transcription_backend_method: "basic_pitch" });
    expect(getRecordedTranscriptionModelAnalyticsProperties(undefined, "light")).toEqual(historical);
    expect(getRecordedTranscriptionModelAnalyticsProperties("msmodel_small", "super_heavy")).toEqual(current);
    expect(getRecordedTranscriptionModelAnalyticsProperties(undefined)).toEqual({});
  });

  it("maps user-facing model choices to backend transcription methods", () => {
    expect(transcriptionModelToBackendMethod("light")).toBe("msmodel_small");
    expect(transcriptionModelToBackendMethod("heavy")).toBe("msmodel_small");
  });

  it("charges Light at 2 and Heavy at 5 credits per interval", () => {
    expect(calculateTranscriptionCredits(30, "light")).toBe(2);
    expect(calculateTranscriptionCredits(30, "heavy")).toBe(2);
    expect(calculateTranscriptionCredits(31, "light")).toBe(4);
    expect(calculateTranscriptionCredits(31, "heavy")).toBe(4);
    expect(calculateTranscriptionCredits(30, "super_heavy")).toBe(5);
    expect(calculateTranscriptionCredits(31, "super_heavy")).toBe(10);
  });

  it("reserves only the user-facing Heavy model for Premium and Pro", () => {
    expect(transcriptionModelRequiresPremium("light")).toBe(false);
    expect(transcriptionModelRequiresPremium("heavy")).toBe(false);
    expect(transcriptionModelRequiresPremium("super_heavy")).toBe(true);
  });
});
