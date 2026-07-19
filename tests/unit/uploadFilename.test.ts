import { describe, expect, it } from "vitest";
import { MAX_BACKEND_FILENAME_LENGTH, normalizeUploadFilename } from "../../lib/uploadFilename";

describe("normalizeUploadFilename", () => {
  it("keeps ordinary filenames unchanged", () => {
    expect(normalizeUploadFilename("my-song.m4a")).toBe("my-song.m4a");
  });

  it("truncates long filenames while preserving the extension", () => {
    const normalized = normalizeUploadFilename(`${"a".repeat(120)}.mp3`);
    expect(normalized).toHaveLength(MAX_BACKEND_FILENAME_LENGTH);
    expect(normalized.endsWith(".mp3")).toBe(true);
  });

  it("removes path and control characters", () => {
    expect(normalizeUploadFilename("folder/rough\u0000 demo.wav")).toBe("rough demo.wav");
  });
});
