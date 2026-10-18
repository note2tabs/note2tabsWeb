import { describe, expect, it } from "vitest";
import type { EditorSnapshot } from "../../types/gte";
import { addScoreNote, durationFrames, editScoreSelection, isNotationTrack, midiAtStep, scoreEvents, spellPitch } from "../../lib/gteNotation";

const base = (): EditorSnapshot => ({
  id: "score", instrumentId: "gm:piano", trackType: "tab", framesPerMessure: 480, totalFrames: 480, fps: 240,
  timeSignature: 4, timeSignatureBottom: 4, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {},
});

describe("pitched notation editor", () => {
  it("preserves explicit staff assignments even across the middle-C register boundary", () => {
    const source = addScoreNote(base(), 60, 0, 120, "bass").snapshot;
    expect(scoreEvents(source)[0].staff).toBe("bass");
    expect(source.notes[0].notationStaff).toBe("bass");
  });
  it("routes pitched instruments without replacing guitar, bass, chord or drum editors", () => {
    for (const instrumentId of ["gm:piano", "gm:strings", "gm:instrument", "gm:synth-lead", "gm:synth-pad"])
      expect(isNotationTrack({ ...base(), instrumentId })).toBe(true);
    for (const trackType of ["bass", "chords", "drums"])
      expect(isNotationTrack({ ...base(), trackType, editorType: trackType })).toBe(false);
    expect(isNotationTrack({ ...base(), instrumentId: "electric" })).toBe(false);
  });
  it("maps all MIDI pitches to staff positions without a guitar range limit", () => {
    for (let midi = 0; midi <= 127; midi++) {
      const pitch = spellPitch(midi);
      expect(midiAtStep(pitch.step) + Number(pitch.sharp)).toBe(midi);
    }
    expect(spellPitch(60)).toMatchObject({ name: "C4", step: 35 });
    expect(spellPitch(61).name).toBe("C♯4");
  });
  it("uses the time signature denominator rather than treating a measure as a whole note", () => {
    expect(durationFrames(base(), 8)).toBe(60);
    expect(durationFrames({ ...base(), timeSignature: 3 }, 4)).toBe(160);
    expect(durationFrames({ ...base(), timeSignature: 6, timeSignatureBottom: 8 }, 8)).toBe(80);
  });
  it("adds a note, keeps polyphony, preserves velocity and extends the timeline immutably", () => {
    const source = base();
    source.notes = [{ id: 4, startTime: 0, length: 480, midiNum: 21, tab: [0, 0], optimals: [], velocity: 0.4 }];
    const result = addScoreNote(source, 108, 450, 120);
    expect(result.note).toMatchObject({ id: 5, midiNum: 108, startTime: 450, length: 120 });
    expect(result.snapshot.totalFrames).toBe(570);
    expect(result.snapshot.notes[0]).toEqual(source.notes[0]);
    expect(source.notes).toHaveLength(1);
  });
  it("reads original chord MIDI, including notes outside guitar range, and does not mutate it", () => {
    const source = base();
    source.chords = [{ id: 2, startTime: 20, length: 50, originalMidi: [21, 60, 108], currentTabs: [[0, 0]], ogTabs: [] }];
    expect(scoreEvents(source).map((event) => event.midi)).toEqual([21, 60, 108]);
    const next = editScoreSelection(source, { noteIds: [], chordIds: [2] }, { transpose: 1 });
    expect(next.chords[0].originalMidi).toEqual([22, 61, 109]);
    expect(source.chords[0].originalMidi).toEqual([21, 60, 108]);
  });
  it("edits notes and chords in one immutable operation and rejects out-of-bounds group moves", () => {
    const source = addScoreNote(base(), 127, 0, 60).snapshot;
    source.chords = [{ id: 8, startTime: 60, length: 120, originalMidi: [48, 60], currentTabs: [[0, 0], [1, 0]], ogTabs: [], velocities: [0.4, 0.8] }];
    const selection = { noteIds: [1], chordIds: [8] };
    expect(editScoreSelection(source, selection, { transpose: 1 })).toBe(source);
    expect(editScoreSelection(source, selection, { shift: -60 })).toBe(source);
    const edited = editScoreSelection(source, selection, { transpose: -1, shift: 30, length: 80 });
    expect(edited.notes[0]).toMatchObject({ midiNum: 126, startTime: 30, length: 80 });
    expect(edited.chords[0]).toMatchObject({ originalMidi: [47, 59], startTime: 90, length: 80, velocities: [0.4, 0.8] });
    expect(source.notes[0].midiNum).toBe(127);
  });
  it("deletes selected objects and their effects, leaving other objects untouched", () => {
    let source = addScoreNote(base(), 60, 0, 60).snapshot;
    source = addScoreNote(source, 64, 60, 60).snapshot;
    source.noteEffects = [{ id: 1, startNoteId: 1, endNoteId: 2, type: 0, noteEffectLabel: "/" }];
    const next = editScoreSelection(source, { noteIds: [1], chordIds: [] }, { remove: true });
    expect(next.notes.map((note) => note.id)).toEqual([2]);
    expect(next.noteEffects).toEqual([]);
    expect(source.notes).toHaveLength(2);
  });
});
