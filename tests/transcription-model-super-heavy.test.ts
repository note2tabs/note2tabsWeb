import { describe, expect, it } from "vitest";
import {
  calculateTranscriptionCredits,
  normalizeTranscriptionModel,
  transcriptionModelToBackendMethod,
} from "../lib/transcriptionModels";

describe("Super Heavy transcription model", () => {
  it("routes to MuScriptor without changing Heavy", () => {
    expect(normalizeTranscriptionModel("super_heavy")).toBe("super_heavy");
    expect(normalizeTranscriptionModel("muscriptor")).toBe("super_heavy");
    expect(transcriptionModelToBackendMethod("super_heavy")).toBe("muscriptor");
    expect(transcriptionModelToBackendMethod("heavy")).toBe("yourmt3");
  });

  it("uses the same credit rate as Heavy", () => {
    expect(calculateTranscriptionCredits(60, "super_heavy")).toBe(
      calculateTranscriptionCredits(60, "heavy")
    );
  });
});
