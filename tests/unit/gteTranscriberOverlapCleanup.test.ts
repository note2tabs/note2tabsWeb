import { describe, expect, it } from "vitest";

import {
  shortenTinyImportedNoteOverlapsInSnapshot,
  transcriberOverlapToleranceFrames,
} from "../../lib/gteTranscriberOverlapCleanup";
import type { EditorSnapshot, Note } from "../../types/gte";

const note = (
  id: number,
  startTime: number,
  length: number,
  stringIndex: number,
  midiNum: number
): Note => ({ id, startTime, length, midiNum, tab: [stringIndex, 0], optimals: [] });

const snapshot = (notes: Note[]): EditorSnapshot => ({
  id: "imported-lane",
  trackType: "tab",
  framesPerMessure: 480,
  fps: 120,
  totalFrames: 960,
  notes,
  chords: [],
  cutPositionsWithCoords: [[[0, 960], [0, 0]]],
  optimalsByTime: {},
});

describe("transcriber overlap cleanup", () => {
  it("shortens a tiny same-string overlap to the next onset", () => {
    const draft = snapshot([
      note(1, 0, 125, 2, 55),
      note(2, 120, 120, 2, 57),
    ]);

    expect(shortenTinyImportedNoteOverlapsInSnapshot(draft)).toBe(1);
    expect(draft.notes[0].length).toBe(120);
    expect(draft.notes[1].length).toBe(120);
  });

  it("preserves intentional overlaps on different strings and larger overlaps", () => {
    const draft = snapshot([
      note(1, 0, 125, 1, 59),
      note(2, 120, 120, 2, 64),
      note(3, 300, 160, 3, 48),
      note(4, 420, 120, 3, 50),
    ]);

    expect(shortenTinyImportedNoteOverlapsInSnapshot(draft)).toBe(0);
    expect(draft.notes.map((item) => item.length)).toEqual([125, 120, 160, 120]);
  });

  it("preserves simultaneous notes and chord objects", () => {
    const draft = snapshot([
      note(1, 0, 125, 2, 55),
      note(2, 0, 125, 2, 59),
      note(3, 120, 120, 2, 57),
    ]);
    draft.chords = [{
      id: 10,
      startTime: 100,
      length: 80,
      originalMidi: [60, 64],
      currentTabs: [[1, 1], [2, 2]],
      ogTabs: [[1, 1], [2, 2]],
    }];

    expect(shortenTinyImportedNoteOverlapsInSnapshot(draft)).toBe(2);
    expect(draft.notes.map((item) => item.length)).toEqual([120, 120, 120]);
    expect(draft.chords[0].length).toBe(80);
  });

  it("derives a strict one-sixty-fourth-note tolerance from the measure", () => {
    expect(transcriberOverlapToleranceFrames(snapshot([]))).toBe(8);
  });
});
