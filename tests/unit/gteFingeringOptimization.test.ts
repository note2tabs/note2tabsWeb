import { describe, expect, it } from "vitest";
import {
  clusterTrackNotesIntoChordGroups,
  finalizeOptimizedTrackFingeringInSnapshot,
  optimizeTrackFingeringInSnapshot,
} from "../../components/GteWorkspace";
import { getTabMidi } from "../../lib/gteTuning";
import type { Chord, EditorSnapshot, Note } from "../../types/gte";

const note = (
  id: number,
  startTime: number,
  midiNum: number,
  tab: [number, number]
): Note => ({ id, startTime, length: 120, midiNum, tab, optimals: [] });

const chord = (
  id: number,
  startTime: number,
  length: number,
  tabs: Array<[number, number]>,
  originalMidi: number[] = tabs.map((tab) => 40 + tab[1])
): Chord => ({
  id,
  startTime,
  length,
  originalMidi,
  currentTabs: tabs,
  ogTabs: tabs,
});

const snapshot = (): EditorSnapshot => ({
  id: "fingering-track",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 480,
  maxFret: 22,
  tuning: {
    presetId: "standard",
    openStringMidi: [64, 59, 55, 50, 45, 40],
    capo: 0,
  },
  notes: [
    note(1, 0, 60, [1, 1]),
    note(2, 4, 64, [0, 0]),
    note(3, 7, 67, [0, 3]),
    note(4, 200, 69, [0, 5]),
  ],
  chords: [],
  noteEffects: [],
  cutPositionsWithCoords: [[[0, 480], [2, 5]]],
  optimalsByTime: {},
});

describe("track fingering optimization", () => {
  it("clusters nearby overlapping onsets without mutating the notes", () => {
    const notes = snapshot().notes;
    const before = JSON.stringify(notes);
    const groups = clusterTrackNotesIntoChordGroups(notes, 15);

    expect(groups.map((group) => group.notes.map((item) => item.id))).toEqual([[1, 2, 3], [4]]);
    expect(JSON.stringify(notes)).toBe(before);
  });

  it("requires note starts and ends to both be close before chordizing", () => {
    const notes = [
      { ...note(1, 0, 60, [1, 1]), length: 240 },
      { ...note(2, 4, 64, [0, 0]), length: 60 },
      { ...note(3, 260, 67, [0, 3]), length: 120 },
      { ...note(4, 267, 71, [1, 4]), length: 126 },
    ];

    const groups = clusterTrackNotesIntoChordGroups(notes, 15);

    expect(groups.map((group) => group.notes.map((item) => item.id))).toEqual([[1], [2], [3, 4]]);
  });

  it("generates coordinates, chordizes clusters, and preserves every pitch", () => {
    const draft = snapshot();
    const result = optimizeTrackFingeringInSnapshot(draft);

    expect(result.createdChordIds).toHaveLength(1);
    expect(draft.notes.map((item) => item.id)).toEqual([4]);
    expect(draft.chords).toHaveLength(1);
    expect(draft.chords[0].originalMidi).toEqual([60, 64, 67]);
    expect(new Set(draft.chords[0].currentTabs.map((tab) => tab[0])).size).toBe(3);
    expect(
      draft.chords[0].currentTabs.map((tab, index) =>
        getTabMidi(draft, tab, draft.chords[0].originalMidi[index])
      )
    ).toEqual(draft.chords[0].originalMidi);
    expect(draft.cutPositionsWithCoords.length).toBeGreaterThan(1);
  });

  it("preserves coordinates supplied by the playing-coordinate generator", () => {
    const draft = snapshot();
    const generatedCoordinates: EditorSnapshot["cutPositionsWithCoords"] = [
      [[0, 160], [0, 3]],
      [[160, 320], [4, 8]],
      [[320, 480], [9, 14]],
    ];
    draft.cutPositionsWithCoords = generatedCoordinates;

    optimizeTrackFingeringInSnapshot(draft, { generatePlayingCoordinates: false });

    expect(draft.cutPositionsWithCoords).toEqual(generatedCoordinates);
  });

  it("can defer chord fingering selection to the backend ranking", () => {
    const draft = snapshot();
    const originalTabs = draft.notes.slice(0, 3).map((item) => item.tab);

    optimizeTrackFingeringInSnapshot(draft, { optimizeChordFingerings: false });

    expect(draft.chords[0].currentTabs).toEqual(originalTabs);
  });

  it("keeps onset clusters larger than the available strings as notes", () => {
    const draft = snapshot();
    draft.notes = Array.from({ length: 7 }, (_, index) =>
      note(index + 1, index, 52 + index, [5 - (index % 6), index])
    );

    optimizeTrackFingeringInSnapshot(draft);

    expect(draft.chords).toHaveLength(0);
    expect(draft.notes).toHaveLength(7);
  });

  it("downgrades one-note chords into notes after optimization", () => {
    const draft = snapshot();
    draft.notes = [];
    draft.chords = [chord(10, 96, 48, [[1, 3]], [62])];

    finalizeOptimizedTrackFingeringInSnapshot(draft);

    expect(draft.chords).toHaveLength(0);
    expect(draft.notes).toHaveLength(1);
    expect(draft.notes[0]).toMatchObject({
      startTime: 96,
      length: 48,
      midiNum: 62,
      tab: [1, 3],
    });
  });

  it("trims overlapping notes and chords so earlier events stop before later events", () => {
    const draft = snapshot();
    draft.notes = [
      { ...note(1, 0, 60, [1, 1]), length: 100 },
      { ...note(2, 80, 64, [0, 0]), length: 70 },
    ];
    draft.chords = [chord(20, 140, 90, [[1, 5], [2, 7]], [69, 72])];

    finalizeOptimizedTrackFingeringInSnapshot(draft);

    expect(draft.notes.find((item) => item.id === 1)?.length).toBe(80);
    expect(draft.notes.find((item) => item.id === 2)?.length).toBe(60);
    expect(draft.chords[0].length).toBe(90);
  });
});
