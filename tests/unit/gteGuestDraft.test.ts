import { describe, expect, it } from "vitest";
import { buildTabRefForTuning } from "../../lib/gteTuning";
import { normalizeGuestSnapshot } from "../../lib/gteGuestDraft";
import type { EditorSnapshot } from "../../types/gte";

const baseSnapshot = (): EditorSnapshot => ({
  id: "local",
  name: "Untitled",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 480,
  secondsPerBar: 2,
  notes: [
    { id: 1, startTime: 0, length: 120, midiNum: 59, tab: [1, 5], optimals: [] },
    { id: 2, startTime: 120, length: 120, midiNum: 61, tab: [1, 7], optimals: [] },
  ],
  chords: [],
  noteEffects: [
    {
      id: 1,
      type: 2,
      startNoteId: 1,
      endNoteId: 2,
      noteEffectLabel: "/",
    },
  ],
  cutPositionsWithCoords: [[[0, 480], [2, 0]]],
  optimalsByTime: {},
  tabRef: buildTabRefForTuning([64, 59, 55, 50, 45, 40], 0, 22),
});

describe("gteGuestDraft", () => {
  it("preserves slide note effects when normalizing guest snapshots", () => {
    const normalized = normalizeGuestSnapshot(baseSnapshot());

    expect(normalized.noteEffects).toEqual([
      expect.objectContaining({
        id: 1,
        type: 2,
        startNoteId: 1,
        endNoteId: 2,
        noteEffectLabel: "/",
      }),
    ]);
  });
});
