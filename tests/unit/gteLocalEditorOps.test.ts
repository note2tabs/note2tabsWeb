import { describe, expect, it } from "vitest";
import {
  addBarLocal,
  addNoteLocal,
  assignNoteTabLocal,
  deleteCutBoundaryLocal,
  deleteNoteLocal,
  disbandChordLocal,
  insertCutBoundaryLocal,
  makeChordLocal,
  moveNoteLocal,
  nextLocalChordId,
  nextLocalNoteId,
  removeBarLocal,
  resizeNoteLocal,
  setChordTabsLocal,
  shiftCutBoundaryLocal,
} from "../../lib/gteLocalEditorOps";
import type { EditorSnapshot } from "../../types/gte";

const snapshot = (): EditorSnapshot => ({
  id: "ed-1",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 960,
  secondsPerBar: 2,
  notes: [
    { id: 1, startTime: 0, length: 120, midiNum: 64, tab: [0, 0], optimals: [] },
    { id: 2, startTime: 240, length: 120, midiNum: 59, tab: [1, 0], optimals: [] },
  ],
  chords: [
    {
      id: 1,
      startTime: 480,
      length: 240,
      originalMidi: [64, 67],
      currentTabs: [
        [0, 0],
        [1, 3],
      ],
      ogTabs: [
        [0, 0],
        [1, 3],
      ],
    },
  ],
  cutPositionsWithCoords: [
    [[0, 480], [2, 0]],
    [[480, 960], [3, 2]],
  ],
  optimalsByTime: {},
});

describe("gte local editor operations", () => {
  it("allocates stable positive local IDs", () => {
    const base = snapshot();
    expect(nextLocalNoteId(base)).toBe(3);
    expect(nextLocalNoteId(base, 10)).toBe(10);
    expect(nextLocalChordId(base)).toBe(2);
  });

  it("adds, moves, resizes, retabs, and deletes notes locally", () => {
    let next = addNoteLocal(snapshot(), {
      startTime: 360,
      length: 60,
      midiNum: 62,
      tab: [2, 5],
    });
    expect(next.notes.map((note) => note.id)).toEqual([1, 2, 3]);

    next = moveNoteLocal(next, 3, 120);
    next = resizeNoteLocal(next, 3, 180);
    next = assignNoteTabLocal(next, 3, [4, 7]);
    expect(next.notes.find((note) => note.id === 3)).toMatchObject({
      startTime: 120,
      length: 180,
      tab: [4, 7],
    });

    next = deleteNoteLocal(next, 3);
    expect(next.notes.map((note) => note.id)).toEqual([1, 2]);
  });

  it("edits chord tabs and can make and disband chords locally", () => {
    let next = setChordTabsLocal(snapshot(), 1, [
      [4, 2],
      [5, 5],
    ]);
    expect(next.chords[0].currentTabs).toEqual([
      [4, 2],
      [5, 5],
    ]);

    next = makeChordLocal(next, [1, 2]);
    const madeChord = next.chords.find((chord) => chord.id === 2);
    expect(madeChord?.currentTabs).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(next.notes).toHaveLength(0);

    next = disbandChordLocal(next, 2);
    expect(next.chords.map((chord) => chord.id)).toEqual([1]);
    expect(next.notes.map((note) => note.tab)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it("normalizes manual cut boundary edits", () => {
    let next = insertCutBoundaryLocal(snapshot(), 240, [5, 8]);
    expect(next.cutPositionsWithCoords).toEqual([
      [[0, 240], [2, 0]],
      [[240, 480], [5, 8]],
      [[480, 960], [3, 2]],
    ]);

    next = shiftCutBoundaryLocal(next, 1, 300);
    expect(next.cutPositionsWithCoords[0][0]).toEqual([0, 300]);
    expect(next.cutPositionsWithCoords[1][0]).toEqual([300, 480]);

    next = deleteCutBoundaryLocal(next, 1);
    expect(next.cutPositionsWithCoords).toEqual([
      [[0, 480], [2, 0]],
      [[480, 960], [3, 2]],
    ]);
  });

  it("adds and removes bars with deterministic note shifts", () => {
    let next = addBarLocal(snapshot());
    expect(next.totalFrames).toBe(1440);

    next = removeBarLocal(next, 0);
    expect(next.totalFrames).toBe(960);
    expect(next.notes.map((note) => note.startTime)).toEqual([]);
    expect(next.chords.map((chord) => chord.startTime)).toEqual([0]);
  });
});
