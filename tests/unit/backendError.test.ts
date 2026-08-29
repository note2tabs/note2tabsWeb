import { describe, expect, it } from "vitest";
import { publicJobError, publicTranscriptionError } from "../../lib/backendError";

describe("publicTranscriptionError", () => {
  it("does not expose backend response bodies", () => {
    expect(publicTranscriptionError(500)).toContain("temporarily unavailable");
  });

  it("returns useful messages for safe status classes", () => {
    expect(publicTranscriptionError(422)).toContain("different file");
    expect(publicTranscriptionError(429)).toContain("wait");
  });
});

describe("publicJobError", () => {
  it("turns technical worker failures into actionable customer copy", () => {
    expect(publicJobError("CUDA worker stack trace at gs://private-bucket/file.wav"))
      .toBe("We could not complete this transcription. Try again with another section or model.");
    expect(publicJobError("request timeout after deadline exceeded")).toContain("shorter section");
    expect(publicJobError("Failed to fetch job status.")).toContain("Check your connection");
  });
});
