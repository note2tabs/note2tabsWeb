import { describe, expect, it } from "vitest";
import {
  DRUM_VOICES,
  buildDrumNote,
  getDrumVoiceForNote,
  isDrumTrackType,
  isSupportedDrumNote,
  snapDrumFrameToGrid,
} from "../../lib/gteDrums";
import { DRUM1_SAMPLE_URLS } from "../../lib/gteDrumPlayback";

describe("drum tracks", () => {
  it("maps every drum voice to its Drum 1 Opus playback sample", () => {
    expect(Object.keys(DRUM1_SAMPLE_URLS)).toHaveLength(DRUM_VOICES.length);
    DRUM_VOICES.forEach((voice) => {
      expect(DRUM1_SAMPLE_URLS[voice.id]).toBe(
        `/sound_samples/drum1/${voice.sampleStem}.opus`
      );
    });
  });

  it("defines the full nine-piece drum kit and number shortcuts", () => {
    expect(DRUM_VOICES.map((voice) => voice.label)).toEqual([
      "Crash cymbal",
      "Ride cymbal",
      "Closed hi-hat",
      "Open hi-hat",
      "High tom",
      "Mid tom",
      "Snare drum",
      "Floor tom",
      "Bass drum",
    ]);
    expect(DRUM_VOICES.map((voice) => voice.key)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("encodes a drum voice in lane_notes-compatible note fields", () => {
    const note = buildDrumNote({
      id: 12,
      startTime: 240,
      voiceIndex: 6,
      length: 30,
    });
    expect(note).toMatchObject({
      id: 12,
      startTime: 240,
      length: 30,
      midiNum: 38,
      tab: [6, 0],
    });
    expect(getDrumVoiceForNote(note).id).toBe("snare");
  });

  it("normalizes supported drum track names", () => {
    expect(isDrumTrackType("drums")).toBe(true);
    expect(isDrumTrackType("percussion")).toBe(true);
    expect(isDrumTrackType("tab")).toBe(false);
  });

  it("rejects legacy sticks hits while sticks are disabled", () => {
    expect(isSupportedDrumNote({ midiNum: 37, tab: [9, 0] })).toBe(false);
  });

  it("snaps each bar independently for non-divisible drum grids", () => {
    expect(snapDrumFrameToGrid(23, 7, 3)).toBe(23);
    expect(snapDrumFrameToGrid(479, 7, 3)).toBe(480);
    expect(snapDrumFrameToGrid(503, 7, 3)).toBe(503);
    expect(snapDrumFrameToGrid(960, 7, 3)).toBe(960);
  });
});
