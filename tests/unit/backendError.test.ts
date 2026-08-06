import { describe, expect, it } from "vitest";
import { publicTranscriptionError } from "../../lib/backendError";

describe("publicTranscriptionError", () => {
  it("does not expose backend response bodies", () => {
    expect(publicTranscriptionError(500)).toBe("We could not start this transcription. Please try again.");
  });

  it("returns useful messages for safe status classes", () => {
    expect(publicTranscriptionError(422)).toContain("different file");
    expect(publicTranscriptionError(429)).toContain("wait");
  });
});
