import { describe, expect, it } from "vitest";
import { cleanTinyOverlapsInSnapshot, meaningfulConflictInfo, isTinyBoundaryOverlap, tinyOverlapToleranceFrames } from "../../lib/gteOverlapCleanup";
import type { EditorSnapshot, Note } from "../../types/gte";

const note = (id: number, startTime: number, length: number, string = 0): Note => ({ id, startTime, length, tab: [string, 3], midiNum: 67, optimals: [], velocity: 80 });
const fixture = (): EditorSnapshot => ({ id: "overlaps", fps: 240, framesPerMessure: 480, totalFrames: 960, cutPositionsWithCoords: [], optimalsByTime: {}, notes: [note(1, 0, 122), note(2, 120, 120)], chords: [] });
describe("negligible overlap cleanup", () => {
  it("can shorten near-full-bar notes and chords to a half-beat attack", () => {
    for (const length of [360, 450, 480, 600]) {
      const source = fixture();
      source.notes = [note(1, 0, length), note(2, 60, 60)];
      source.chords = [
        { id: 3, startTime: 0, length, currentTabs: [[1, 4], [2, 5]], ogTabs: [], originalMidi: [63, 60] },
        { id: 4, startTime: 60, length: 60, currentTabs: [[1, 5]], ogTabs: [], originalMidi: [64] },
      ];
      expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(2);
      expect(source.notes[0].length).toBe(60);
      expect(source.chords[0].length).toBe(60);
      expect(source.notes[1].startTime).toBe(60);
      expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(0);
    }
  });
  it("does not shorten long tails below half a beat", () => {
    const source = fixture(); source.notes = [note(1, 0, 480), note(2, 30, 60)];
    expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(0);
    expect(source.notes[0].length).toBe(480);
  });
  it("trims a sustained bar-seven chord before its final-beat replacement", () => {
    const source = fixture(); source.notes = [];
    const start = 6 * 480;
    source.chords = [
      { id: 1, startTime: start, length: 480, currentTabs: [[0, 4], [1, 5]], ogTabs: [], originalMidi: [68, 64] },
      { id: 2, startTime: start + 360, length: 120, currentTabs: [[0, 4], [1, 5]], ogTabs: [], originalMidi: [68, 64] },
    ];
    const later = structuredClone(source.chords[1]);
    expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(1);
    expect(source.chords[0].length).toBe(360);
    expect(source.chords[1]).toEqual(later);
    expect(meaningfulConflictInfo(source).conflictKeys.size).toBe(0);
    expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(0);
  });
  it("manually trims a partial chord overlap in bar nine larger than 15ms", () => {
    const source = fixture();
    const start = 8 * 480 + 240;
    source.notes = [note(2, start + 72, 120)];
    source.chords = [{ id: 1, startTime: start, length: 96, currentTabs: [[0, 3], [1, 1]], ogTabs: [], originalMidi: [67, 60] }];
    expect(cleanTinyOverlapsInSnapshot(structuredClone(source))).toBe(0);
    expect(meaningfulConflictInfo(source).conflictKeys.size).toBeGreaterThan(0);
    expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(1);
    expect(source.chords[0].length).toBe(72);
    expect(source.chords[0].startTime).toBe(start);
    expect(source.notes[0].startTime).toBe(start + 72);
    expect(meaningfulConflictInfo(source).conflictKeys.size).toBe(0);
    expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(0);
  });
  it("keeps larger overlaps, simultaneous starts and very short articulations outside the manual margin", () => {
    for (const [length, start, laterLength] of [[241, 120, 120], [120, 0, 120], [12, 4, 120]]) {
      const source = fixture(); source.notes = [note(1, 0, length), note(2, start, laterLength)];
      const before = structuredClone(source);
      expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(0);
      expect(source).toEqual(before);
    }
  });
  it("cleans a long bar-eleven chord tail before short following chords", () => {
    const source = fixture(); source.notes = [];
    const start = 10 * 480;
    source.chords = [
      { id: 1, startTime: start, length: 120, currentTabs: [[0, 4], [1, 5]], ogTabs: [], originalMidi: [68, 64] },
      { id: 2, startTime: start + 90, length: 30, currentTabs: [[0, 4], [1, 5]], ogTabs: [], originalMidi: [68, 64] },
      { id: 3, startTime: start + 120, length: 60, currentTabs: [[0, 4], [1, 5]], ogTabs: [], originalMidi: [68, 64] },
    ];
    const following = structuredClone(source.chords.slice(1));
    expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(1);
    expect(source.chords[0].length).toBe(90);
    expect(source.chords.slice(1)).toEqual(following);
    expect(meaningfulConflictInfo(source).conflictKeys.size).toBe(0);
    expect(cleanTinyOverlapsInSnapshot(source, { manual: true })).toBe(0);
  });
  it("shares a bounded timing and relative-duration tolerance with conflict detection", () => {
    const source = fixture();
    expect(tinyOverlapToleranceFrames(source)).toBe(3.75);
    expect(tinyOverlapToleranceFrames({ ...source, fps: 24 })).toBe(3.75);
    expect(meaningfulConflictInfo(source).conflictKeys.size).toBe(0);
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(1);
    expect(source.notes.map((note) => [note.startTime, note.length])).toEqual([[0, 120], [120, 120]]);
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(0);
  });
  it("preserves meaningful overlaps, short articulations, simultaneous notes and different strings", () => {
    const source = fixture();
    expect(isTinyBoundaryOverlap(source, { start: 0, end: 10 }, { start: 9, end: 20 })).toBe(false);
    source.notes = [note(0, 0, 130), note(2, 120, 120), note(3, 0, 130, 1), note(4, 0, 130, 1)];
    expect(meaningfulConflictInfo(source).noteConflicts).toEqual(new Set([0, 2, 3, 4]));
    const before = structuredClone(source);
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(0);
    expect(source).toEqual(before);
    source.notes = [note(1, 0, 122), note(2, 120, 120, 1)];
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(0);
    expect(meaningfulConflictInfo(source).conflictKeys.size).toBe(0);
  });
  it("trims notes against chords and repeated chord boundaries without changing chord members", () => {
    const source = fixture(); source.notes = [];
    source.chords = [0, 120].map((startTime, index) => ({ id: index + 1, startTime, length: index ? 120 : 122, currentTabs: [[0, 3], [1, 1]], ogTabs: [[0, 3], [1, 1]], originalMidi: [67, 60], velocities: [70, 90] }));
    const second = structuredClone(source.chords[1]);
    expect(meaningfulConflictInfo(source).conflictKeys.size).toBe(0);
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(1);
    expect(source.chords[0].length).toBe(120);
    expect(source.chords[1]).toEqual(second);
    source.notes = [note(10, 0, 122)]; source.chords = [second];
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(1);
    expect(source.notes[0].length).toBe(120);
  });
  it("trims a chord even when only one member overlaps a later note", () => {
    const source = fixture(); source.notes = [note(2, 120, 120)];
    source.chords = [{ id: 1, startTime: 0, length: 122, currentTabs: [[0, 3], [1, 1]], ogTabs: [[0, 3], [1, 1]], originalMidi: [67, 60] }];
    const before = structuredClone(source.chords[0]);
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(1);
    expect(source.chords[0]).toEqual({ ...before, length: 120 });
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(0);
    expect(meaningfulConflictInfo(source).conflictKeys.size).toBe(0);
  });
  it("cleans partially shared chord strings using the earliest tiny boundary", () => {
    const source = fixture(); source.notes = [];
    source.chords = [
      { id: 1, startTime: 0, length: 122, currentTabs: [[0, 3], [1, 1]], ogTabs: [], originalMidi: [67, 60] },
      { id: 2, startTime: 120, length: 120, currentTabs: [[0, 5], [2, 2]], ogTabs: [], originalMidi: [69, 57] },
    ];
    const later = structuredClone(source.chords[1]);
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(1);
    expect(source.chords[0].length).toBe(120);
    expect(source.chords[1]).toEqual(later);
  });
  it("preserves final strums and does not clean drum tracks", () => {
    const source = fixture();
    source.chords = [{ id: 1, startTime: 0, length: 122, currentTabs: [[0, 3], [1, 1]], ogTabs: [], originalMidi: [67, 60] }];
    source.notes = [note(2, 120, 120)];
    source.notes.push(note(3, 120, 120, 1));
    source.chords[0].strums = [{ time: 121, direction: "down" }];
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(0);
    source.trackType = "drums";
    expect(cleanTinyOverlapsInSnapshot(source)).toBe(0);
  });
});
