import { describe, expect, it } from "vitest";
import { generatePlayingCoordinatesInSnapshot } from "../../lib/gtePlayingCoordinates";
import type { EditorSnapshot, Note } from "../../types/gte";

const buildSnapshot = (
  totalFrames: number,
  stamps: Array<[number, [number, number], number]>
): EditorSnapshot => ({
  id: "cut-parity",
  framesPerMessure: 480,
  fps: 240,
  totalFrames,
  maxFret: 22,
  tuning: { presetId: "standard", openStringMidi: [64, 59, 55, 50, 45, 40], capo: 0 },
  notes: stamps.map(([startTime, tab, length], index): Note => ({
    id: index + 1,
    startTime,
    length,
    tab,
    midiNum: [64, 59, 55, 50, 45, 40][tab[0]] + tab[1],
    optimals: [],
  })),
  chords: [],
  noteEffects: [],
  cutPositionsWithCoords: [[[0, totalFrames], [2, 0]]],
  optimalsByTime: {},
});

describe("frontend playing-coordinate generator", () => {
  it.each([
    {
      name: "single chunk with a late position change",
      totalFrames: 480,
      stamps: [[0, [5, 0], 120], [120, [4, 3], 120], [240, [3, 5], 120]],
      expected: [[[0, 180], [2, 2]], [[180, 480], [2, 4]]],
    },
    {
      name: "alternating pitch jumps that smooth into one region",
      totalFrames: 960,
      stamps: [[0, [5, 0], 80], [100, [0, 18], 80], [220, [5, 1], 80], [350, [0, 20], 80], [600, [4, 3], 180]],
      expected: [[[0, 80], [2, 0]], [[80, 212], [2, 18]], [[212, 338], [2, 1]], [[338, 548], [2, 20]], [[548, 960], [2, 3]]],
    },
    {
      name: "four-bar chunk boundary",
      totalFrames: 2400,
      stamps: [[0, [5, 0], 300], [700, [0, 15], 300], [1800, [5, 2], 300], [2100, [0, 17], 200]],
      expected: [[[0, 500], [2, 0]], [[500, 1400], [2, 15]], [[1400, 2100], [2, 2]], [[2100, 2400], [2, 17]]],
    },
  ])("creates ordered non-overlapping regions: $name", ({ totalFrames, stamps, expected }) => {
    const snapshot = buildSnapshot(totalFrames, stamps as Array<[number, [number, number], number]>);
    generatePlayingCoordinatesInSnapshot(snapshot);
    expect(snapshot.cutPositionsWithCoords).toEqual(expected);
  });

  it("matches the backend empty-note fallback", () => {
    const snapshot = buildSnapshot(480, []);
    generatePlayingCoordinatesInSnapshot(snapshot);
    expect(snapshot.cutPositionsWithCoords).toEqual([[[0, 480], [2, 0]]]);
  });

  it("recomputes note alternatives like backend generateCutPositions", () => {
    const snapshot = buildSnapshot(480, [
      [0, [5, 0], 120],
      [120, [4, 3], 120],
      [240, [3, 5], 120],
    ]);
    generatePlayingCoordinatesInSnapshot(snapshot);
    expect(snapshot.notes.map((note) => note.optimals)).toEqual([
      [[5, 0]],
      [[4, 3], [5, 8]],
      [[2, 0], [3, 5], [4, 10], [5, 15]],
    ]);
  });

  it("uses the four-string bass fretboard for regions and alternatives", () => {
    const snapshot = buildSnapshot(480, []);
    snapshot.trackType = "bass";
    snapshot.editorType = "bass";
    snapshot.tuning = { presetId: "bass-standard", openStringMidi: [43, 38, 33, 28], capo: 0 };
    snapshot.notes = [
      { id: 1, startTime: 0, length: 120, midiNum: 43, tab: [0, 0], optimals: [] },
      { id: 2, startTime: 120, length: 120, midiNum: 45, tab: [0, 2], optimals: [] },
    ];
    generatePlayingCoordinatesInSnapshot(snapshot);
    expect(snapshot.cutPositionsWithCoords).toEqual([[[0, 480], [2, 1]]]);
    expect(snapshot.notes[0].optimals).toEqual([[0, 0], [1, 5], [2, 10], [3, 15]]);
    expect(snapshot.notes[1].optimals).toEqual([[0, 2], [1, 7], [2, 12], [3, 17]]);
    expect(snapshot.notes.flatMap((note) => note.optimals).every(([stringIndex]) => stringIndex < 4)).toBe(true);
  });

  it("keeps a sustained A6 bass region independent from a later A14 passage", () => {
    const snapshot = buildSnapshot(3840, []);
    snapshot.trackType = "bass";
    snapshot.editorType = "bass";
    snapshot.tuning = { presetId: "bass-standard", openStringMidi: [43, 38, 33, 28], capo: 0 };
    snapshot.notes = [
      { id: 1, startTime: 1920, length: 960, midiNum: 39, tab: [2, 6], optimals: [] },
      { id: 2, startTime: 1920, length: 960, midiNum: 44, tab: [1, 6], optimals: [] },
      { id: 3, startTime: 1920, length: 960, midiNum: 49, tab: [0, 6], optimals: [] },
      { id: 4, startTime: 3000, length: 200, midiNum: 57, tab: [0, 14], optimals: [] },
    ];

    generatePlayingCoordinatesInSnapshot(snapshot);

    const bar6Coordinate = snapshot.cutPositionsWithCoords.find(
      ([[start, end]]) => start <= 2400 && 2400 < end
    );
    expect(bar6Coordinate?.[1]).toEqual([2, 6]);
    expect(snapshot.cutPositionsWithCoords).toEqual([
      [[0, 2940], [2, 6]],
      [[2940, 3840], [2, 14]],
    ]);
  });

  it("does not collapse a low bar-six passage across ascending bars seven through ten", () => {
    const snapshot = buildSnapshot(6240, []);
    snapshot.trackType = "bass";
    snapshot.editorType = "bass";
    snapshot.tuning = { presetId: "bass-standard", openStringMidi: [43, 38, 33, 28], capo: 0 };
    snapshot.notes = [
      { id: 1, startTime: 2640, length: 60, midiNum: 45, tab: [0, 2], optimals: [] },
      { id: 2, startTime: 2700, length: 60, midiNum: 41, tab: [1, 3], optimals: [] },
      { id: 3, startTime: 2640, length: 60, midiNum: 34, tab: [2, 1], optimals: [] },
      { id: 4, startTime: 3300, length: 60, midiNum: 59, tab: [0, 16], optimals: [] },
      { id: 5, startTime: 3420, length: 60, midiNum: 61, tab: [0, 18], optimals: [] },
      { id: 6, startTime: 3540, length: 60, midiNum: 63, tab: [0, 20], optimals: [] },
      { id: 7, startTime: 3660, length: 60, midiNum: 64, tab: [0, 21], optimals: [] },
      { id: 8, startTime: 4300, length: 480, midiNum: 64, tab: [0, 21], optimals: [] },
    ];

    generatePlayingCoordinatesInSnapshot(snapshot);
    const coordinateAt = (frame: number) => snapshot.cutPositionsWithCoords.find(
      ([[start, end]]) => start <= frame && frame < end
    )?.[1][1];
    expect(coordinateAt(2640)).toBeLessThanOrEqual(3);
    expect(coordinateAt(3420)).toBeGreaterThanOrEqual(16);
    expect(coordinateAt(4300)).toBeGreaterThanOrEqual(20);
    expect(snapshot.cutPositionsWithCoords.every(([[start, end]]) => end > start)).toBe(true);
  });
});
