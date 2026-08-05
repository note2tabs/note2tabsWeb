import { describe, expect, it } from "vitest";
import { applyDrumBeatPattern, DRUM_BEAT_PATTERNS } from "../../lib/gteDrumPatterns";
import { buildDrumNote, getDrumVoiceForNote } from "../../lib/gteDrums";

describe("drum beat patterns", () => {
  it("provides a useful selection of named beats", () => {
    expect(DRUM_BEAT_PATTERNS.map((pattern) => pattern.label)).toEqual([
      "Classic Rock",
      "Four on the Floor",
      "Half-Time",
      "Funk",
      "Disco",
      "Punk",
    ]);
  });

  it("clears and replaces every selected bar without changing other bars", () => {
    const untouched = buildDrumNote({ id: 1, startTime: 970, voiceIndex: 4 });
    const replaced = buildDrumNote({ id: 2, startTime: 20, voiceIndex: 6 });
    const notes = applyDrumBeatPattern({
      notes: [untouched, replaced],
      barIndices: [0, 1],
      patternId: "classic-rock",
      beatsPerBar: 4,
      framesPerBar: 480,
    });

    expect(notes).toContainEqual(untouched);
    expect(notes).not.toContainEqual(replaced);
    expect(notes.some((note) => note.startTime >= 0 && note.startTime < 480)).toBe(true);
    expect(notes.some((note) => note.startTime >= 480 && note.startTime < 960)).toBe(true);
  });

  it("repeats four-beat grooves across longer meters", () => {
    const notes = applyDrumBeatPattern({
      notes: [],
      barIndices: [0],
      patternId: "four-on-the-floor",
      beatsPerBar: 8,
      framesPerBar: 480,
    });
    const kicks = notes.filter((note) => getDrumVoiceForNote(note).id === "kick");

    expect(kicks).toHaveLength(8);
    expect(kicks.map((note) => note.startTime)).toEqual([0, 60, 120, 180, 240, 300, 360, 420]);
  });
});
