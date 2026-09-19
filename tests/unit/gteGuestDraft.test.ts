import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearGuestDraft,
  normalizeGuestSnapshot,
  readGuestDraft,
  writeGuestDraft,
} from "../../lib/gteGuestDraft";
import type { EditorSnapshot } from "../../types/gte";

const baseSnapshot = (): EditorSnapshot => ({
  id: "local",
  name: "Untitled",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 480,
  secondsPerBar: 2,
  notes: [
    { id: 1, startTime: 0, length: 120, midiNum: 59, tab: [1, 5], optimals: [] },
    { id: 2, startTime: 120, length: 120, midiNum: 61, tab: [1, 7], optimals: [] },
  ],
  chords: [],
  noteEffects: [
    {
      id: 1,
      type: 2,
      startNoteId: 1,
      endNoteId: 2,
      noteEffectLabel: "/",
    },
  ],
  cutPositionsWithCoords: [[[0, 480], [2, 0]]],
  optimalsByTime: {},
  maxFret: 22,
  tuning: { presetId: "standard", openStringMidi: [64, 59, 55, 50, 45, 40], capo: 0 },
});

describe("gteGuestDraft", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats unavailable browser storage as an empty optional cache", () => {
    vi.stubGlobal("window", { localStorage: null });

    expect(readGuestDraft()).toBeNull();
    expect(() => writeGuestDraft(baseSnapshot())).not.toThrow();
    expect(() => clearGuestDraft()).not.toThrow();
  });

  it("treats browser storage access failures as an empty optional cache", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new DOMException("Blocked", "SecurityError"); },
        setItem: () => { throw new DOMException("Blocked", "SecurityError"); },
        removeItem: () => { throw new DOMException("Blocked", "SecurityError"); },
      },
    });

    expect(readGuestDraft()).toBeNull();
    expect(() => writeGuestDraft(baseSnapshot())).not.toThrow();
    expect(() => clearGuestDraft()).not.toThrow();
  });

  it("preserves slide note effects when normalizing guest snapshots", () => {
    const normalized = normalizeGuestSnapshot(baseSnapshot());

    expect(normalized.noteEffects).toEqual([
      expect.objectContaining({
        id: 1,
        type: 2,
        startNoteId: 1,
        endNoteId: 2,
        noteEffectLabel: "/",
      }),
    ]);
  });

  it("preserves chord fingering and strumming when normalizing guest snapshots", () => {
    const snapshot = baseSnapshot();
    snapshot.editorType = "chords";
    snapshot.type = "chords";
    snapshot.trackType = "chords";
    snapshot.chords = [
      {
        id: 7,
        startTime: 120,
        length: 240,
        originalMidi: [48, 52, 55],
        currentTabs: [[5, 8], [4, 7], [3, 5]],
        ogTabs: [[5, 8], [4, 7], [3, 5]],
        root: "C",
        quality: "major",
        label: "C",
        fingeringIndex: 2,
        strums: [
          { id: 1, time: 0, direction: "down" },
          { id: 2, time: 60, direction: "up" },
          { id: 3, time: 120, direction: "mute" },
        ],
      },
    ];

    const normalized = normalizeGuestSnapshot(snapshot);

    expect(normalized.chords).toEqual([
      expect.objectContaining({
        id: 7,
        fingeringIndex: 2,
        strums: [
          { id: 1, time: 0, direction: "down" },
          { id: 2, time: 60, direction: "up" },
          { id: 3, time: 120, direction: "mute" },
        ],
      }),
    ]);
  });
});
