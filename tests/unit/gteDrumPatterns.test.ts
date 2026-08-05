import { describe, expect, it } from "vitest";
import { applyDrumBeatPattern, DRUM_BEAT_PATTERNS } from "../../lib/gteDrumPatterns";
import { buildDrumNote, getDrumVoiceForNote } from "../../lib/gteDrums";

describe("drum beat patterns", () => {
  it("provides a useful selection of named beats", () => {
    expect(DRUM_BEAT_PATTERNS.map((pattern) => pattern.label)).toEqual([
      "Slow Ballad",
      "Slow Rock",
      "Four on the Floor",
      "Half-Time",
      "Funk (Busy)",
      "Disco",
      "Punk (Fast)",
    ]);
  });

  it("keeps the slow ballad sparse enough for high-tempo songs", () => {
    const notes = applyDrumBeatPattern({
      notes: [],
      barIndices: [0],
      patternId: "slow-ballad",
      beatsPerBar: 4,
      framesPerBar: 480,
    });

    expect(notes).toHaveLength(5);
    expect([...new Set(notes.map((note) => note.startTime))]).toEqual([0, 240]);
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

  it("spreads one four-beat groove across the full default eight-count bar", () => {
    const notes = applyDrumBeatPattern({
      notes: [],
      barIndices: [0],
      patternId: "four-on-the-floor",
      beatsPerBar: 8,
      framesPerBar: 480,
    });
    const kicks = notes.filter((note) => getDrumVoiceForNote(note).id === "kick");

    expect(kicks).toHaveLength(4);
    expect(kicks.map((note) => note.startTime)).toEqual([0, 120, 240, 360]);
  });
});
