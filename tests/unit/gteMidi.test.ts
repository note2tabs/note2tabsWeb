import { describe, expect, it } from "vitest";
import { editMidiEvents, midiFitPlan, midiGridFrames, midiPosition, pasteMidiEvents, snapMidiFrame, snapMidiStrength } from "../../lib/gteMidi";
import { addScoreNote, scoreEvents, scorePlaybackEvents, toggleScoreConnection } from "../../lib/gteNotation";
import { buildNotationScore } from "../../lib/gteNotationScore";
import { restoreNotationSnapshot, serializeNotationSnapshot } from "../../lib/gteNotationPersistence";
import { normalizeGuestSnapshot } from "../../lib/gteGuestDraft";
import type { EditorSnapshot } from "../../types/gte";
const empty = (): EditorSnapshot => ({ id: "piano", instrumentId: "gm:piano", notes: [], chords: [], totalFrames: 480, framesPerMessure: 480, fps: 240, timeSignature: 4, timeSignatureBottom: 4, optimalsByTime: {}, cutPositionsWithCoords: [] });
const score = () => addScoreNote(addScoreNote(empty(), 60, 0, 60, "treble", 2).snapshot, 64, 60, 120, "treble").snapshot;
describe("shared MIDI and sheet music model", () => {
  it("separates snap strength and triplet rhythm from zoom and preserves subgrid precision", () => {
    expect(midiGridFrames(empty(), 8, true)).toBe(40);
    expect(snapMidiStrength(47, 30, 1)).toBe(60);
    expect(snapMidiStrength(47, 30, 0.5)).toBe(53.5);
    expect(snapMidiStrength(47, 30, 0)).toBe(47);
    expect(midiPosition(150, empty())).toBe("1.2.240");
    expect(midiPosition(480, empty())).toBe("2.1.000");
  });
  it("fits content that begins much later than time zero, including pitch outliers", () => {
    const events = scoreEvents(score()).map((event, index) => ({ ...event, start: event.start + 4800, midi: index ? 100 : 36 }));
    const plan = midiFitPlan(events, 480, 900, 480);
    expect(plan.left).toBeGreaterThan(0);
    expect(plan.top).toBeLessThan((127 - 100) * plan.row);
    expect(plan.top + 480).toBeGreaterThan((127 - 36) * plan.row);
  });
  it("scales velocities proportionally and constrains moved notes to a key without retuning unselected music", () => {
    const source = score(); source.notes[0].velocity = 0.4; source.notes[1].velocity = 0.8;
    const scaled = editMidiEvents(source, ["n:1", "n:2"], { velocityScale: 0.5 });
    expect(scaled.notes.map((note) => note.velocity)).toEqual([30 / 127, 0.4]);
    expect(scorePlaybackEvents(scaled).map((note) => note.velocity)).toEqual([30 / 127, 0.4]);
    const moved = editMidiEvents(source, ["n:1"], { transpose: 1, key: { root: 0, type: 0 } });
    expect(moved.notes[0].midiNum).toBe(60); expect(moved.notes[1]).toEqual(source.notes[1]);
  });
  it("moves and resizes individual notes, preserving expression and manual voice", () => {
    const source = score(); source.notes[0].velocity = 0.6; source.notes[0].pitchBend = [0, 0.3];
    const moved = editMidiEvents(source, ["n:1"], { shift: 7.5, transpose: 2, lengthDelta: 22.5 });
    expect(moved.notes[0]).toMatchObject({ startTime: 7.5, length: 82.5, midiNum: 62, velocity: 0.6, pitchBend: [0, 0.3], notationVoice: 2 });
    expect(moved.notes[1]).toEqual(source.notes[1]);
    const engraved = buildNotationScore(moved);
    expect(engraved.measures[0].voices.treble[1].some((token) => token.pitches.some((pitch) => pitch.midi === 62))).toBe(true);
    expect(source.notes[0].midiNum).toBe(60);
  });
  it("edits one imported chord tone independently and remaps phrasing", () => {
    const source = score(); source.chords = [{ id: 4, startTime: 240, length: 120, originalMidi: [60, 64, 67], currentTabs: [[0, 0], [0, 0], [0, 0]], ogTabs: [], velocities: [0.3, 0.5, 0.7], notationVoice: 2 }];
    source.notation = { slurs: [{ from: "n:1", to: "c:4:1" }] };
    const next = editMidiEvents(source, ["c:4:1"], { transpose: 1, shift: 15 });
    expect(next.chords).toEqual([]);
    expect(scoreEvents(next).filter((event) => event.noteId! > 2).map((event) => [event.midi, event.start, event.velocity, event.voice])).toEqual([[60, 240, 0.3, 2], [65, 255, 0.5, 2], [67, 240, 0.7, 2]]);
    expect(next.notation?.slurs).toEqual([{ from: "n:1", to: "n:4" }]);
    expect(source.chords).toHaveLength(1);
  });
  it("rejects out-of-range group edits atomically", () => {
    const source = score();
    expect(editMidiEvents(source, ["n:1", "n:2"], { shift: -1 })).toBe(source);
    expect(editMidiEvents(source, ["n:1", "n:2"], { transpose: 100 })).toBe(source);
    expect(editMidiEvents(source, ["n:1", "n:2"], { lengthDelta: -60 })).toBe(source);
  });
  it("clamps typed and scaled velocities to a minimum of MIDI 30", () => {
    for (const change of [{ velocity: 0 }, { velocity: 29 / 127 }, { velocityScale: 0.01 }]) {
      expect(editMidiEvents(score(), ["n:1"], change).notes[0].velocity).toBe(30 / 127);
    }
  });
  it("supports deletion and velocity without modifying unrelated notes", () => {
    const source = score();
    const next = editMidiEvents(source, ["n:2"], { velocity: 45 / 127 });
    expect(next.notes[1].velocity).toBe(45 / 127); expect(next.notes[0]).toEqual(source.notes[0]);
    expect(editMidiEvents(next, ["n:2"], { remove: true }).notes).toHaveLength(1);
  });
  it("copies groups with relative time, duration, velocity and voice intact", () => {
    const source = score(); source.notes[0].velocity = 0.4;
    const result = pasteMidiEvents(source, scoreEvents(source), 300);
    expect(result.keys).toEqual(["n:3", "n:4"]);
    expect(result.snapshot.notes.slice(2).map((note) => [note.startTime, note.length, note.velocity, note.notationVoice])).toEqual([[300, 60, 0.4, 2], [360, 120, 100 / 127, 1]]);
  });
  it("uses meter-aware fractional grids and retains off-grid timing until explicitly snapped", () => {
    expect(midiGridFrames(empty(), 64)).toBe(7.5);
    expect(midiGridFrames({ ...empty(), timeSignature: 6, timeSignatureBottom: 8 }, 8)).toBe(80);
    expect(snapMidiFrame(41, 30)).toBe(30);
    const next = editMidiEvents(score(), ["n:1"], { shift: 0.75 });
    buildNotationScore(next); expect(next.notes[0].startTime).toBe(0.75);
  });
  it("breaks invalid ties after an independent MIDI edit", () => {
    let source = addScoreNote(addScoreNote(empty(), 60, 0, 60).snapshot, 60, 60, 60).snapshot;
    source = toggleScoreConnection(source, { noteIds: [1, 2], chordIds: [] }, "ties");
    expect(editMidiEvents(source, ["n:2"], { shift: 1 }).notation?.ties).toEqual([]);
  });
  it("round-trips precise MIDI performance through metadata and guest normalization without undoing fresh edits", () => {
    const source = editMidiEvents(score(), ["n:1"], { shift: 0.75, lengthDelta: 0.5, velocity: 0.4 });
    const wire = serializeNotationSnapshot(source); delete wire.notation;
    wire.notes = wire.notes.map(({ notationVoice, notationStaff, velocity, pitchBend, ...note }) => ({ ...note, startTime: Math.round(note.startTime), length: Math.round(note.length) }));
    const restored = restoreNotationSnapshot(wire);
    expect(restored.notes[0]).toMatchObject({ startTime: 0.75, length: 60.5, velocity: 0.4 });
    const edited = editMidiEvents(restored, ["n:1"], { shift: 30 });
    expect(restoreNotationSnapshot(edited).notes[0].startTime).toBe(30.75);
    expect(normalizeGuestSnapshot(edited).notes[0]).toMatchObject({ startTime: 30.75, length: 60.5, velocity: 0.4 });
  });
});

import { editScoreSelection as snapEditSelection } from "../../lib/gteNotation";
it("snaps selected notation notes to the nearest in-key pitch", () => {
  const source = { notes: [{ id: 1, midiNum: 61, startTime: 0, length: 60, tab: [0, 0], optimals: [] }, { id: 2, midiNum: 63, startTime: 60, length: 60, tab: [0, 0], optimals: [] }], chords: [], totalFrames: 480 } as any;
  const next = snapEditSelection(source, { noteIds: [1], chordIds: [] }, { snapKey: { root: 0, type: 0 } });
  expect(next.notes.map((note: any) => note.midiNum)).toEqual([60, 63]);
});
