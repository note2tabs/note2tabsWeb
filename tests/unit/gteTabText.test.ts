import { describe, expect, it } from "vitest";
import { buildTabRefForTuning } from "../../lib/gteTuning";
import { buildTabTextFromSnapshot } from "../../lib/gteTabText";
import type { EditorSnapshot } from "../../types/gte";

const baseSnapshot = (): EditorSnapshot => ({
  id: "ed-1",
  name: "Track 1",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 480,
  secondsPerBar: 2,
  notes: [
    { id: 1, startTime: 0, length: 120, midiNum: 64, tab: [0, 3], optimals: [] },
    { id: 2, startTime: 120, length: 120, midiNum: 66, tab: [0, 5], optimals: [] },
    { id: 3, startTime: 120, length: 120, midiNum: 59, tab: [1, 5], optimals: [] },
    { id: 4, startTime: 240, length: 120, midiNum: 61, tab: [1, 7], optimals: [] },
    { id: 5, startTime: 0, length: 120, midiNum: 55, tab: [2, 8], optimals: [] },
    { id: 6, startTime: 120, length: 120, midiNum: 53, tab: [2, 6], optimals: [] },
    { id: 7, startTime: 240, length: 120, midiNum: 50, tab: [3, 7], optimals: [] },
    { id: 8, startTime: 360, length: 120, midiNum: 52, tab: [3, 9], optimals: [] },
  ],
  chords: [],
  noteEffects: [
    { id: 1, type: 1, startNoteId: 1, endNoteId: 2, noteEffectLabel: "h" },
    { id: 2, type: 2, startNoteId: 3, endNoteId: 4, noteEffectLabel: "/" },
    { id: 3, type: 1, startNoteId: 5, endNoteId: 6, noteEffectLabel: "p" },
    { id: 4, type: 0, startNoteId: 7, endNoteId: 8, noteEffectLabel: "b" },
  ],
  cutPositionsWithCoords: [[[0, 480], [2, 0]]],
  optimalsByTime: {},
  tabRef: buildTabRefForTuning([64, 59, 55, 50, 45, 40], 0, 22),
});

describe("gteTabText", () => {
  it("renders hammer-ons, pull-offs, slides, and bends in ASCII output", () => {
    const text = buildTabTextFromSnapshot(baseSnapshot(), { barsPerRow: 1, barWidth: 16 });
    const lines = text.split("\n");

    expect(lines[0]).toContain("3-h-5");
    expect(lines[1]).toContain("5///7");
    expect(lines[2]).toContain("8-p-6");
    expect(lines[3]).toContain("7b-9");
  });
});
