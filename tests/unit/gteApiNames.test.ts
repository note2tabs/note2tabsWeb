import { describe, expect, it } from "vitest";
import { MAX_EDITOR_NAME_LENGTH, normalizeEditorName } from "../../lib/gteApi";

describe("normalizeEditorName", () => {
  it("keeps editor names within the backend contract", () => {
    const value = normalizeEditorName(`${"long title ".repeat(12)}.mp3`);
    expect(value?.length).toBeLessThanOrEqual(MAX_EDITOR_NAME_LENGTH);
  });

  it("removes control characters and ignores blank names", () => {
    expect(normalizeEditorName("  Song\u0000 name  ")).toBe("Song name");
    expect(normalizeEditorName("   ")).toBeUndefined();
  });
});
