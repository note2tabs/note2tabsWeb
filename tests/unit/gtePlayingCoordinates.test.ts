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

describe("frontend playing-coordinate generator backend parity", () => {
  it.each([
    {
      name: "single chunk with a late position change",
      totalFrames: 480,
      stamps: [[0, [5, 0], 120], [120, [4, 3], 120], [240, [3, 5], 120]],
      expected: [[[0, 320], [2, 0]], [[320, 480], [2, 2]]],
    },
    {
      name: "alternating pitch jumps that smooth into one region",
      totalFrames: 960,
      stamps: [[0, [5, 0], 80], [100, [0, 18], 80], [220, [5, 1], 80], [350, [0, 20], 80], [600, [4, 3], 180]],
      expected: [[[0, 960], [2, 9]]],
    },
    {
      name: "four-bar chunk boundary",
      totalFrames: 2400,
      stamps: [[0, [5, 0], 300], [700, [0, 15], 300], [1800, [5, 2], 300], [2100, [0, 17], 200]],
      expected: [[[0, 1920], [2, 8]], [[1920, 2180], [2, 2]], [[2180, 2400], [2, 10]]],
    },
  ])("matches Python backend output: $name", ({ totalFrames, stamps, expected }) => {
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
});
