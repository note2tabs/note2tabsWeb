import { describe, expect, it } from "vitest";
import {
  DRUM_VOICES,
  buildDrumNote,
  getDrumVoiceForNote,
  isDrumTrackType,
} from "../../lib/gteDrums";

describe("drum tracks", () => {
  it("defines the seven requested drum voices and number shortcuts", () => {
    expect(DRUM_VOICES.map((voice) => voice.label)).toEqual([
      "Cymbal",
      "Closed hi-hat",
      "Open hi-hat",
      "Bass",
      "Kick",
      "Snare",
      "Sticks",
    ]);
    expect(DRUM_VOICES.map((voice) => voice.key)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("encodes a drum voice in lane_notes-compatible note fields", () => {
    const note = buildDrumNote({
      id: 12,
      startTime: 240,
      voiceIndex: 5,
      length: 30,
    });
    expect(note).toMatchObject({
      id: 12,
      startTime: 240,
      length: 30,
      midiNum: 38,
      tab: [5, 0],
    });
    expect(getDrumVoiceForNote(note).id).toBe("snare");
  });

  it("normalizes supported drum track names", () => {
    expect(isDrumTrackType("drums")).toBe(true);
    expect(isDrumTrackType("percussion")).toBe(true);
    expect(isDrumTrackType("tab")).toBe(false);
  });
});
