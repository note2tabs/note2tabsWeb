import { describe, expect, it } from "vitest";
import {
  calculateTranscriptionCredits,
  normalizeTranscriptionModel,
  transcriptionModelToBackendMethod,
} from "../lib/transcriptionModels";

describe("MSModel transcription model", () => {
  it("routes MSModel through the compatible backend method", () => {
    expect(normalizeTranscriptionModel("super_heavy")).toBe("super_heavy");
    expect(normalizeTranscriptionModel("msmodel")).toBe("super_heavy");
    // Legacy links and persisted values remain accepted.
    expect(normalizeTranscriptionModel("muscriptor")).toBe("super_heavy");
    expect(transcriptionModelToBackendMethod("super_heavy")).toBe("muscriptor");
    expect(transcriptionModelToBackendMethod("heavy")).toBe("yourmt3");
  });

  it("charges the user-facing Heavy model at 5 credits per interval", () => {
    expect(calculateTranscriptionCredits(60, "super_heavy")).toBe(10);
  });
});
