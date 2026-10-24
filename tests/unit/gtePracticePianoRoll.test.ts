import { expect, it } from "vitest";
import { isBlackPianoKey, pianoPitchCenter, practiceNoteWindow, practicePitchRange, PRACTICE_VOICE_COLORS } from "../../lib/gtePracticePianoRoll";

it("maps white and black keys onto a standard seven-white-key octave", () => {
  expect(pianoPitchCenter(72) - pianoPitchCenter(60)).toBe(7);
  expect(pianoPitchCenter(61)).toBeGreaterThan(pianoPitchCenter(60));
  expect(pianoPitchCenter(61)).toBeLessThan(pianoPitchCenter(62));
  expect(isBlackPianoKey(61)).toBe(true);
  expect(isBlackPianoKey(60)).toBe(false);
});
it("projects notes toward the fixed timing line from the shared playback frame", () => {
  expect(practiceNoteWindow(100, 50, 0, 200, 400)).toEqual({ top: 100, bottom: 200, active: false });
  expect(practiceNoteWindow(100, 50, 100, 200, 400)).toEqual({ top: 300, bottom: 400, active: true });
  expect(practiceNoteWindow(100, 50, 150, 200, 400)).toBeNull();
  // Seeking / looping back derives the original position without internal clock drift.
  expect(practiceNoteWindow(100, 50, 0, 200, 400)?.bottom).toBe(200);
  expect(practiceNoteWindow(300, 50, 0, 200, 400)).toBeNull();
});
it("keeps sparse tracks at a useful octave range and includes extreme pitches", () => {
  for (const pitches of [[], [60], [0], [127], [21, 108]]) {
    const range = practicePitchRange(pitches);
    expect(range.high - range.low + 1).toBeGreaterThanOrEqual(60);
    expect(range.low).toBeGreaterThanOrEqual(0);
    expect(range.high).toBeLessThanOrEqual(127);
    for (const pitch of pitches) { expect(range.low).toBeLessThanOrEqual(pitch); expect(range.high).toBeGreaterThanOrEqual(pitch); }
  }
  expect(PRACTICE_VOICE_COLORS[1].active).not.toBe(PRACTICE_VOICE_COLORS[2].active);
});
