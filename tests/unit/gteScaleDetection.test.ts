import { describe, expect, it } from "vitest";
import {
  collectGteMidiCounts,
  detectEditorScale,
  midiToScalePitchKey,
} from "../../lib/gteScaleDetection";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";

const baseEditor = (id: string): EditorSnapshot => ({
  id,
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 480,
  notes: [],
  chords: [],
  cutPositionsWithCoords: [[[0, 480], [0, 0]]],
  optimalsByTime: {},
});

const baseCanvas = (editors: EditorSnapshot[]): CanvasSnapshot => ({
  id: "canvas-1",
  editors,
});

describe("gte scale detection", () => {
  it("maps midi notes to 1-12 pitch keys with C as 1 and B as 12", () => {
    expect(midiToScalePitchKey(60)).toBe(1);
    expect(midiToScalePitchKey(61)).toBe(2);
    expect(midiToScalePitchKey(71)).toBe(12);
  });

  it("collects note and chord midi counts across the whole gte", () => {
    const tabLane = baseEditor("tab-1");
    tabLane.notes = [
      { id: 1, startTime: 0, length: 120, midiNum: 60, tab: [5, 3], optimals: [] },
      { id: 2, startTime: 120, length: 120, midiNum: 64, tab: [4, 2], optimals: [] },
    ];

    const chordLane = baseEditor("chords-1");
    chordLane.chords = [
      {
        id: 3,
        startTime: 0,
        length: 480,
        originalMidi: [60, 64, 67],
        currentTabs: [],
        ogTabs: [],
      },
      {
        id: 4,
        startTime: 480,
        length: 480,
        originalMidi: [],
        currentTabs: [],
        ogTabs: [],
        fingering: {
          root: "F",
          type: "Major",
          positions: [1, 3, 3, 2, 1, 1],
          midiNotes: [65, 69, 72],
        },
      },
    ];

    expect(collectGteMidiCounts(baseCanvas([tabLane, chordLane]))).toEqual({
      60: 2,
      64: 2,
      65: 1,
      67: 1,
      69: 1,
      72: 1,
    });
  });

  it("returns the lowest-rms scale candidate from the normalized pitch distribution", () => {
    const lane = baseEditor("tab-1");
    lane.notes = [
      { id: 1, startTime: 0, length: 120, midiNum: 60, tab: [5, 3], optimals: [] },
      { id: 2, startTime: 120, length: 120, midiNum: 62, tab: [4, 0], optimals: [] },
      { id: 3, startTime: 240, length: 120, midiNum: 64, tab: [4, 2], optimals: [] },
      { id: 4, startTime: 360, length: 120, midiNum: 65, tab: [3, 3], optimals: [] },
    ];
    lane.chords = [
      {
        id: 5,
        startTime: 480,
        length: 480,
        originalMidi: [67, 69, 71, 72],
        currentTabs: [],
        ogTabs: [],
      },
    ];

    const result = detectEditorScale(baseCanvas([lane]));

    expect(result).toMatchObject({
      rootKey: 1,
      root: "C",
      scaleType: "Major",
      totalNotes: 8,
    });
    expect(result?.pitchClassCounts).toMatchObject({
      1: 2,
      3: 1,
      5: 1,
      6: 1,
      8: 1,
      10: 1,
      12: 1,
    });
    expect(result?.normalizedDistribution[1]).toBe(0.25);
    expect(result?.keyDistribution).toMatchObject({
      1: 1,
      3: 1,
      5: 1,
      6: 1,
      8: 1,
      10: 1,
      12: 1,
    });
  });

  it("returns null when the gte has no playable midi notes", () => {
    expect(detectEditorScale(baseCanvas([baseEditor("empty")]))).toBeNull();
  });
});
