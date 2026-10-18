import { describe, expect, it } from "vitest";
import { optimizeMergedChord } from "../../lib/gteOptimizeMergedChord";
import { mergeNotesIntoChordLocal } from "../../lib/gteLocalEditorOps";
import type { EditorSnapshot } from "../../types/gte";

const fixture = (): EditorSnapshot => ({ id: "merge", fps: 240, framesPerMessure: 480, totalFrames: 960,
  cutPositionsWithCoords: [[[0, 960], [2, 12]]], optimalsByTime: {},
  notes: [{ id: 1, startTime: 0, length: 120, midiNum: 67, tab: [0, 3], optimals: [] }],
  chords: [
    { id: 1, startTime: 0, length: 120, originalMidi: [60, 64], currentTabs: [[1, 1], [0, 0]], ogTabs: [[1, 1], [0, 0]] },
    { id: 2, startTime: 480, length: 120, originalMidi: [62, 65], currentTabs: [[1, 3], [0, 1]], ogTabs: [[1, 3], [0, 1]] },
  ],
});

describe("optimize merged chord", () => {
  it("optimizes the merged fingering without changing unrelated content or its timing", () => {
    const source = fixture(), before = structuredClone(source);
    const merged = mergeNotesIntoChordLocal(source, 1, [1]);
    const result = optimizeMergedChord(merged, 1);
    const chord = result.chords.find((item) => item.id === 1)!;
    expect(chord.currentTabs).not.toEqual(merged.chords[0].currentTabs);
    expect(new Set(chord.currentTabs.map((tab) => tab[0])).size).toBe(chord.currentTabs.length);
    expect(chord.startTime).toBe(0); expect(chord.length).toBe(120);
    expect(chord.originalMidi).toEqual([60, 64, 67]);
    expect(result.chords[1]).toEqual(source.chords[1]);
    expect(result.cutPositionsWithCoords).toEqual(source.cutPositionsWithCoords);
    expect(source).toEqual(before);
  });
  it("handles chord-to-chord merges and missing targets safely", () => {
    const source = fixture();
    const merged = mergeNotesIntoChordLocal(source, 1, [], [2]);
    const result = optimizeMergedChord(merged, 1);
    expect(result.chords).toHaveLength(1);
    expect(result.notes).toEqual(source.notes);
    expect(result.chords[0].length).toBe(600);
    expect(optimizeMergedChord(source, 999)).toEqual(source);
  });
});
