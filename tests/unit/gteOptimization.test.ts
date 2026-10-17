import { describe, expect, it } from "vitest";
import { coordinateAt, coordinateEditorResult, createCoordinateEditorDraft, editableOptimizationCuts, optimizationAnchorString, optimizationRange, optimizeSelection, replaceCoordinateWindow, type OptimizeOptions } from "../../lib/gteOptimization";
import type { EditorSnapshot } from "../../types/gte";

const fixture = (): EditorSnapshot => ({ id: "optimize", fps: 240, framesPerMessure: 480, totalFrames: 960, maxFret: 22,
  cutPositionsWithCoords: [[[0, 480], [1, 3]], [[480, 960], [3, 8]]], optimalsByTime: {},
  notes: [
    { id: 1, startTime: 100, length: 120, midiNum: 60, tab: [1, 1], optimals: [], velocity: 80 },
    { id: 2, startTime: 100, length: 120, midiNum: 64, tab: [0, 0], optimals: [], velocity: 90 },
    { id: 3, startTime: 100, length: 150, midiNum: 67, tab: [2, 12], optimals: [[0, 3]], velocity: 75, pitchBend: [0, 1] },
  ],
  chords: [{ id: 1, startTime: 500, length: 100, originalMidi: [60, 64], currentTabs: [[1, 1], [0, 0]], ogTabs: [[1, 1], [0, 0]], velocities: [80, 90] }], noteEffects: [],
});
const selected = { noteIds: [1, 2], chordIds: [] };
const options: OptimizeOptions = { scope: "selected", position: "chosen", fret: 7, custom: false, cuts: [] };

describe("unified optimization", () => {
  it("crops the legacy coordinate workspace to the selected time span and rebases edits back", () => {
    const snapshot = fixture(), before = structuredClone(snapshot);
    const draft = createCoordinateEditorDraft(snapshot, selected, "selected", editableOptimizationCuts(snapshot, selected, "selected", 5))!;
    expect(draft.totalFrames).toBe(120);
    expect(draft.notes.map((note) => [note.startTime, note.length])).toEqual([[0, 120], [0, 120], [0, 120]]);
    expect(draft.chords).toHaveLength(0);
    expect(draft.cutPositionsWithCoords).toEqual([[[0, 120], [1, 3]]]);
    // The legacy workspace may round its timeline up to a bar. Never persist that extra range.
    draft.totalFrames = 480;
    draft.cutPositionsWithCoords = [[[0, 50], [2, 8]], [[50, 480], [1, 4]]];
    expect(coordinateEditorResult(draft, 100, 220)).toEqual([[[100, 150], [2, 8]], [[150, 220], [1, 4]]]);
    expect(snapshot).toEqual(before);
  });
  it("chordizes only explicitly selected notes, preserving overlapping unselected content", () => {
    const snapshot = fixture(), before = structuredClone(snapshot);
    const result = optimizeSelection(snapshot, selected, options);
    expect(result.notes.find((note) => note.id === 3)).toEqual(snapshot.notes[2]);
    expect(result.chords.find((chord) => chord.id === 1)).toEqual(snapshot.chords[0]);
    expect(result.chords).toHaveLength(2);
    const created = result.chords.find((chord) => chord.id !== 1)!;
    expect(created.originalMidi).toEqual([60, 64]);
    expect(created.velocities).toEqual([80, 90]);
    expect(new Set(result.chords.map((chord) => chord.id)).size).toBe(2);
    expect(snapshot).toEqual(before);
  });
  it("anchors the chosen fret to G and confines coordinates to the selection window", () => {
    const snapshot = fixture();
    const result = optimizeSelection(snapshot, selected, options);
    expect(optimizationAnchorString(snapshot)).toBe(2);
    expect(coordinateAt(result.cutPositionsWithCoords, 150, [0, 0])).toEqual([2, 7]);
    for (const time of [0, 99, 220, 479, 480, 959]) expect(coordinateAt(result.cutPositionsWithCoords, time, [0, 0])).toEqual(coordinateAt(snapshot.cutPositionsWithCoords, time, [0, 0]));
    expect(result.totalFrames).toBe(snapshot.totalFrames);
  });
  it("supports custom boundaries and string/fret coordinates without changing outside regions", () => {
    const snapshot = fixture();
    const result = optimizeSelection(snapshot, selected, { ...options, custom: true, cuts: [[[100, 160], [2, 5]], [[160, 220], [1, 8]]] });
    expect(coordinateAt(result.cutPositionsWithCoords, 120, [0, 0])).toEqual([2, 5]);
    expect(coordinateAt(result.cutPositionsWithCoords, 200, [0, 0])).toEqual([1, 8]);
    expect(coordinateAt(result.cutPositionsWithCoords, 250, [0, 0])).toEqual([1, 3]);
    expect(() => optimizeSelection(snapshot, selected, { ...options, custom: true, cuts: [[[100, 150], [2, 5]], [[170, 220], [1, 8]]] })).toThrow(/without gaps/);
  });
  it("uses the same chord-building pipeline for automatic positioning, in either scope", () => {
    const snapshot = fixture();
    const scoped = optimizeSelection(snapshot, selected, { ...options, position: "automatic" });
    expect(scoped.chords).toHaveLength(2);
    expect(scoped.notes.find((note) => note.id === 3)).toEqual(snapshot.notes[2]);
    expect(coordinateAt(scoped.cutPositionsWithCoords, 300, [0, 0])).toEqual([1, 3]);
    const whole = optimizeSelection(snapshot, { noteIds: [], chordIds: [] }, { ...options, scope: "track", position: "automatic" });
    expect(whole.chords.some((chord) => chord.originalMidi.join(",") === "60,64")).toBe(true);
    expect(whole.cutPositionsWithCoords.length).toBeGreaterThan(0);
  });
  it("leaves empty selections untouched and prepares custom editing for exactly the chosen scope", () => {
    const snapshot = fixture();
    expect(optimizeSelection(snapshot, { noteIds: [], chordIds: [] }, options)).toEqual(snapshot);
    expect(optimizationRange(snapshot, selected, "selected")).toEqual({ start: 100, end: 220 });
    expect(editableOptimizationCuts(snapshot, selected, "selected", 7)).toEqual([[[100, 220], [1, 3]]]);
    const cuts = replaceCoordinateWindow(snapshot.cutPositionsWithCoords, [[[100, 220], [2, 7]]], 100, 220, 960, [2, 0]);
    expect(cuts.map(([range]) => range)).toEqual([[0, 100], [100, 220], [220, 480], [480, 960]]);
  });
  it("allocates unique IDs when the legacy pipeline converts a one-member chord to a note", () => {
    const snapshot = fixture();
    snapshot.chords[0].currentTabs = [[0, 5]];
    snapshot.chords[0].ogTabs = [[0, 5]];
    snapshot.chords[0].originalMidi = [69];
    const result = optimizeSelection(snapshot, { noteIds: [], chordIds: [1] }, options);
    expect(result.chords).toHaveLength(0);
    expect(result.notes).toHaveLength(4);
    expect(new Set(result.notes.map((note) => note.id)).size).toBe(4);
    for (const note of snapshot.notes) expect(result.notes.find((item) => item.id === note.id)).toEqual(note);
  });
});
