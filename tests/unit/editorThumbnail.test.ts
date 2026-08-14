import { describe, expect, it } from "vitest";
import { getEditorThumbnail } from "../../lib/editorThumbnail";

describe("editor home thumbnails", () => {
  it("renders valid saved tab coordinates", () => {
    const result = getEditorThumbnail({
      id: "editor-1",
      noteCount: 99,
      previewNotes: [
        { startTime: 0, string: 1, fret: 3 },
        { startTime: 120, string: 2, fret: 5 },
      ],
    });

    expect(result.label).toBe("TAB");
    expect(result.previewNotes).toHaveLength(2);
  });

  it("never labels populated legacy or stale data as empty", () => {
    expect(getEditorThumbnail({ id: "editor-1", noteCount: 99 }).label).toBe(
      "PREVIEW UNAVAILABLE"
    );
    expect(getEditorThumbnail({ id: "editor-2", chordCount: 4 }).label).toBe(
      "PREVIEW UNAVAILABLE"
    );
  });

  it("labels a genuinely blank editor as empty", () => {
    expect(getEditorThumbnail({ id: "editor-1", noteCount: 0, chordCount: 0 }).label).toBe(
      "EMPTY TAB"
    );
  });
});
