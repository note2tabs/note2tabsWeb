import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createCoordinatePreview } from "../../lib/gteCoordinatePreview";
import { optimizeSelection } from "../../lib/gteOptimization";
import { optimizeTrackFingeringInSnapshot, finalizeOptimizedTrackFingeringInSnapshot } from "../../lib/gteFingeringOptimization";
import { buildGtePerformanceFixture } from "../../lib/gtePerformanceFixture";
import type { CutWithCoord, EditorSnapshot } from "../../types/gte";

const fixture = (): EditorSnapshot => ({ id: "preview", fps: 240, framesPerMessure: 480, totalFrames: 960,
  cutPositionsWithCoords: [[[0, 960], [2, 5]]], optimalsByTime: {},
  notes: [
    { id: 1, startTime: 0, length: 100, tab: [0, 0], midiNum: 64, optimals: [] },
    { id: 2, startTime: 480, length: 100, tab: [1, 1], midiNum: 60, optimals: [] },
  ], chords: [], noteEffects: [],
});
const cuts = (fret: number): CutWithCoord[] => [[[0, 240], [2, fret]], [[240, 960], [2, 5]]];

describe("live coordinate preview", () => {
  it("moves existing chord fingerings toward changed fret positions without accumulating changes", () => {
    const source = fixture(); source.notes = [];
    source.chords = [{ id: 1, startTime: 0, length: 100, originalMidi: [60, 64, 67], currentTabs: [[1, 1], [0, 0], [2, 12]], ogTabs: [[1, 1], [0, 0], [2, 12]] }];
    const original = structuredClone(source), preview = createCoordinatePreview(source);
    const low = preview.update(cuts(2)).snapshot;
    const high = preview.update(cuts(14)).snapshot;
    const average = (snapshot: EditorSnapshot) => snapshot.chords[0].currentTabs.reduce((sum, tab) => sum + tab[1], 0) / snapshot.chords[0].currentTabs.length;
    expect(average(high)).toBeGreaterThan(average(low));
    expect(high.chords[0].currentTabs).not.toEqual(low.chords[0].currentTabs);
    const applied = optimizeSelection(source, { noteIds: [], chordIds: [1] }, { scope: "track", position: "chosen", fret: 14, custom: true, cuts: cuts(14) });
    expect(applied.chords[0].currentTabs).toEqual(high.chords[0].currentTabs);
    expect(preview.update(cuts(2)).snapshot).toEqual(low);
    expect(source).toEqual(original);
  });
  it("recalculates only changed coordinate dependencies and always starts from the original", () => {
    const source = fixture(), before = structuredClone(source), preview = createCoordinatePreview(source);
    const initial = preview.update(cuts(5));
    expect(initial.recomputedGroups).toBe(2);
    expect(preview.update(cuts(5)).recomputedGroups).toBe(0);
    const changed = preview.update(cuts(12));
    expect(changed.recomputedGroups).toBe(1);
    expect(changed.snapshot.notes.find((note) => note.id === 2)).toEqual(initial.snapshot.notes.find((note) => note.id === 2));
    expect(preview.update(cuts(5)).snapshot).toEqual(initial.snapshot);
    // Callers cannot poison cached results.
    changed.snapshot.notes[0].tab = [0, 22];
    expect(preview.update(cuts(12)).snapshot.notes[0].tab).not.toEqual([0, 22]);
    expect(source).toEqual(before);
    const redundant: CutWithCoord[] = [[[0, 60], [2, 12]], [[60, 240], [2, 12]], [[240, 960], [2, 5]]];
    expect(preview.update(redundant).recomputedGroups).toBe(0);
  });

  it("matches the existing algorithm for overlapping notes and effect chains", () => {
    const source = fixture();
    source.notes.push({ id: 3, startTime: 10, length: 100, tab: [2, 5], midiNum: 60, optimals: [] });
    source.noteEffects = [{ id: 1, type: 2, startNoteId: 1, endNoteId: 2, noteEffectLabel: "/" }];
    const preview = createCoordinatePreview(source);
    const result = preview.update(cuts(12));
    expect(result.totalGroups).toBe(1);
    const expected = structuredClone(source); expected.cutPositionsWithCoords = cuts(12);
    optimizeTrackFingeringInSnapshot(expected, { preferPlayingPosition: true }); finalizeOptimizedTrackFingeringInSnapshot(expected);
    // Generated IDs are deliberately reserved across cache groups.
    const musical = (snapshot: EditorSnapshot) => ({ notes: snapshot.notes.map(({ id, ...note }) => note), chords: snapshot.chords.map(({ id, ...chord }) => chord) });
    expect(musical(result.snapshot)).toEqual(musical(expected));
  });

  it("preserves unselected notes and keeps generated IDs unique across groups", () => {
    const source = fixture();
    source.notes.push({ ...source.notes[0], id: 3, tab: [1, 1], midiNum: 60 });
    source.notes.push({ ...source.notes[1], id: 4, tab: [0, 0], midiNum: 64 });
    const result = createCoordinatePreview(source).update(cuts(5)).snapshot;
    expect(result.chords).toHaveLength(2);
    expect(new Set(result.chords.map((chord) => chord.id)).size).toBe(2);
    const selected = createCoordinatePreview(source, { noteIds: [1], chordIds: [] }).update(cuts(12)).snapshot;
    expect(selected.notes.find((note) => note.id === 3)).toEqual(source.notes[2]);
    expect(selected.chords).toEqual([]);
  });

  it("measures a large preview and an unchanged update", () => {
    const source = buildGtePerformanceFixture({ trackCount: 1, bars: 120, notesPerLane: 900 }).editors[0];
    const started = performance.now();
    const preview = createCoordinatePreview(source);
    const initial = preview.update(source.cutPositionsWithCoords);
    const initialMs = performance.now() - started;
    const cachedStart = performance.now();
    const cached = preview.update(source.cutPositionsWithCoords);
    const cachedMs = performance.now() - cachedStart;
    const changedCuts = structuredClone(source.cutPositionsWithCoords);
    changedCuts[0][1][1] = changedCuts[0][1][1] === 7 ? 8 : 7;
    const changedStart = performance.now();
    const changed = preview.update(changedCuts);
    process.stdout.write(`Coordinate preview: ${source.notes.length} notes, ${initial.totalGroups} groups; initial ${initialMs.toFixed(1)}ms, unchanged ${cachedMs.toFixed(1)}ms, changed ${changed.recomputedGroups} groups ${(performance.now() - changedStart).toFixed(1)}ms\n`);
    expect(cached.recomputedGroups).toBe(0);
    expect(cached.snapshot).toEqual(initial.snapshot);
  });
});
