import { describe, expect, it } from "vitest";
import {
  calculateTranscriptionCredits,
  normalizeTranscriptionModel,
  transcriptionModelToBackendMethod,
} from "../../lib/transcriptionModels";

describe("transcription models", () => {
  it("defaults missing values to the light model", () => {
    expect(normalizeTranscriptionModel(undefined)).toBe("light");
  });

  it("keeps legacy backend values on the light model", () => {
    expect(normalizeTranscriptionModel("basic_pitch")).toBe("light");
  });

  it("normalizes YourMT3 aliases to the heavy model", () => {
    expect(normalizeTranscriptionModel("heavy")).toBe("heavy");
    expect(normalizeTranscriptionModel("yourmt3+")).toBe("heavy");
    expect(normalizeTranscriptionModel("mt3-plus")).toBe("heavy");
  });

  it("maps user-facing model choices to backend transcription methods", () => {
    expect(transcriptionModelToBackendMethod("light")).toBe("basic_pitch");
    expect(transcriptionModelToBackendMethod("heavy")).toBe("yourmt3");
  });

  it("charges light jobs at 2 credits and heavy jobs at 3 credits per interval", () => {
    expect(calculateTranscriptionCredits(30, "light")).toBe(2);
    expect(calculateTranscriptionCredits(30, "heavy")).toBe(3);
    expect(calculateTranscriptionCredits(31, "light")).toBe(4);
    expect(calculateTranscriptionCredits(31, "heavy")).toBe(6);
  });
});
