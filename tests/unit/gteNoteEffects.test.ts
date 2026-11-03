import { describe, expect, it } from "vitest";
import {
  alignEffectNotesToFirstString,
  getEffectAwareFingeringUpdates,
  orderNotesForEffect,
} from "../../lib/gteNoteEffects";
import type { EditorSnapshot } from "../../types/gte";

const buildSnapshot = (): EditorSnapshot => ({
  id: "effect-test",
  notes: [
    { id: 1, startTime: 10, length: 5, midiNum: 45, tab: [1, 0], optimals: [] },
    { id: 2, startTime: 30, length: 5, midiNum: 50, tab: [2, 0], optimals: [] },
    { id: 3, startTime: 20, length: 5, midiNum: 47, tab: [2, 2], optimals: [] },
  ],
  chords: [],
  noteEffects: [],
  maxFret: 12,
  tuning: { presetId: "custom", openStringMidi: [40, 45, 50, 55, 59, 64], capo: 0 },
  totalFrames: 480,
  fps: 240,
  framesPerMessure: 480,
  cutPositionsWithCoords: [],
  optimalsByTime: {},
});

const connectAllNotes = (snapshot: EditorSnapshot) => {
  snapshot.noteEffects = [
    { id: 1, type: 2, startNoteId: 1, endNoteId: 3, noteEffectLabel: "slide" },
    { id: 2, type: 2, startNoteId: 3, endNoteId: 2, noteEffectLabel: "slide" },
  ];
};

describe("note effect string alignment", () => {
  it("orders selected notes by time before building an effect chain", () => {
    const snapshot = buildSnapshot();
    expect(orderNotesForEffect(snapshot, [2, 1, 3]).map((note) => note.id)).toEqual([1, 3, 2]);
  });

  it("moves later notes to equivalent frets on the first note's string", () => {
    const snapshot = buildSnapshot();
    const result = alignEffectNotesToFirstString(snapshot, [2, 1, 3]);

    expect(result).toMatchObject({ ok: true, noteIds: [1, 3, 2], targetString: 1 });
    expect(snapshot.notes.find((note) => note.id === 1)?.tab).toEqual([1, 0]);
    expect(snapshot.notes.find((note) => note.id === 3)?.tab).toEqual([1, 2]);
    expect(snapshot.notes.find((note) => note.id === 2)?.tab).toEqual([1, 5]);
    expect(snapshot.notes.map((note) => note.midiNum)).toEqual([45, 50, 47]);
  });

  it("does not partially move notes when one pitch is unavailable on the target string", () => {
    const snapshot = buildSnapshot();
    const unreachable = snapshot.notes.find((note) => note.id === 2)!;
    unreachable.midiNum = 70;
    const before = snapshot.notes.map((note) => [...note.tab]);

    expect(alignEffectNotesToFirstString(snapshot, [1, 3, 2])).toMatchObject({
      ok: false,
      failedNoteId: 2,
    });
    expect(snapshot.notes.map((note) => note.tab)).toEqual(before);
  });

  it("moves the first open note to a lower string when the second pitch cannot fit its original string", () => {
    const snapshot = buildSnapshot();
    snapshot.notes = [
      {...snapshot.notes[0], tab: [5, 0], midiNum: 64},
      {...snapshot.notes[1], tab: [4, 2], midiNum: 61},
    ];
    const before = snapshot.notes.map(note => ({midi: note.midiNum, start: note.startTime, length: note.length}));
    expect(alignEffectNotesToFirstString(snapshot, [2, 1])).toMatchObject({
      ok: true, targetString: 4, changedNoteIds: [1],
    });
    expect(snapshot.notes.map(note => note.tab)).toEqual([[4, 5], [4, 2]]);
    expect(snapshot.notes.map(note => ({midi: note.midiNum, start: note.startTime, length: note.length}))).toEqual(before);
  });

  it("finds a common string for a whole sequence even when neither endpoint's string fits", () => {
    const snapshot = buildSnapshot();
    snapshot.notes[0] = {...snapshot.notes[0], tab: [5, 0], midiNum: 64};
    snapshot.notes[1] = {...snapshot.notes[1], tab: [0, 10], midiNum: 50};
    snapshot.notes[2] = {...snapshot.notes[2], tab: [3, 2], midiNum: 57};
    snapshot.maxFret = 20;
    const result = alignEffectNotesToFirstString(snapshot, [1, 2, 3]);
    expect(result.ok).toBe(true);
    expect(new Set(snapshot.notes.map(note => note.tab[0])).size).toBe(1);
    expect(snapshot.notes.map(note => note.midiNum)).toEqual([64, 50, 57]);
    expect(snapshot.notes.every(note => note.tab[1] >= 0 && note.tab[1] <= 20)).toBe(true);
  });

  it("moves an entire connected effect chain when one note is re-fingered", () => {
    const snapshot = buildSnapshot();
    connectAllNotes(snapshot);

    expect(getEffectAwareFingeringUpdates(snapshot, [{ noteId: 3, tab: [0, 9] }])).toEqual([
      { noteId: 1, tab: [0, 5] },
      { noteId: 2, tab: [0, 10] },
      { noteId: 3, tab: [0, 9] },
    ]);
  });

  it("keeps individually unreachable connected notes on their current strings", () => {
    const snapshot = buildSnapshot();
    connectAllNotes(snapshot);

    expect(getEffectAwareFingeringUpdates(snapshot, [{ noteId: 3, tab: [5, 0] }])).toEqual([
      { noteId: 3, tab: [5, 0] },
    ]);
  });
});
