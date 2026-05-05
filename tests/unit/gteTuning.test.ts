import { describe, expect, it } from "vitest";
import { applyTuningToSnapshot, buildTabRefForTuning, getSnapshotTuning } from "../../lib/gteTuning";
import type { EditorSnapshot } from "../../types/gte";

const baseSnapshot = (): EditorSnapshot => ({
  id: "ed-1",
  name: "Track 1",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 480,
  secondsPerBar: 2,
  notes: [
    { id: 1, startTime: 0, length: 120, midiNum: 40, tab: [5, 0], optimals: [] },
    { id: 2, startTime: 120, length: 120, midiNum: 64, tab: [0, 0], optimals: [] },
  ],
  chords: [
    {
      id: 3,
      startTime: 240,
      length: 120,
      originalMidi: [40, 45],
      currentTabs: [
        [5, 0],
        [4, 0],
      ],
      ogTabs: [
        [5, 0],
        [4, 0],
      ],
    },
  ],
  cutPositionsWithCoords: [[[0, 480], [2, 0]]],
  optimalsByTime: {},
  tabRef: buildTabRefForTuning([64, 59, 55, 50, 45, 40], 0, 22),
});

describe("gte tuning", () => {
  it("builds tab refs from tuning and capo", () => {
    const tabRef = buildTabRefForTuning([64, 59, 55, 50, 45, 38], 2, 22);
    expect(tabRef[5][0]).toBe(40);
    expect(tabRef[5][12]).toBe(52);
    expect(tabRef[0][0]).toBe(66);
  });

  it("applies tuning to note and chord playback pitches", () => {
    const tuned = applyTuningToSnapshot(baseSnapshot(), "drop-d", 0);
    expect(tuned.tuning?.presetId).toBe("drop-d");
    expect(tuned.notes[0].midiNum).toBe(38);
    expect(tuned.notes[1].midiNum).toBe(64);
    expect(tuned.chords[0].originalMidi).toEqual([38, 45]);
  });

  it("reads normalized tuning defaults", () => {
    expect(getSnapshotTuning(baseSnapshot())).toEqual({ presetId: "standard", capo: 0 });
  });
});
