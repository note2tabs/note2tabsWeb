import { describe, expect, it } from "vitest";
import { buildImportTrackPreviewEvents } from "../../lib/gteImportTrackPreview";

describe("buildImportTrackPreviewEvents", () => {
  it("starts preview at the first track note while preserving later timing", () => {
    expect(buildImportTrackPreviewEvents([
      [960, [0, 0], 120],
      [1200, [1, 1], 240],
    ], 240)).toEqual([
      { start: 0, duration: 0.5, midi: 64 },
      { start: 1, duration: 1, midi: 60 },
    ]);
  });
});
