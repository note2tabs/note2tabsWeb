import { expect, it } from "vitest";
import { isBlackPianoKey, pianoPitchCenter, practiceNoteWindow, practicePitchRange, practiceKeyActive, practiceKeyIllumination, practiceVisibleStart, PRACTICE_VOICE_COLORS } from "../../lib/gtePracticePianoRoll";

it("maps white and black keys onto a standard seven-white-key octave", () => {
  expect(pianoPitchCenter(72) - pianoPitchCenter(60)).toBe(7);
  expect(pianoPitchCenter(61)).toBeGreaterThan(pianoPitchCenter(60));
  expect(pianoPitchCenter(61)).toBeLessThan(pianoPitchCenter(62));
  expect(isBlackPianoKey(61)).toBe(true);
  expect(isBlackPianoKey(60)).toBe(false);
});
it("animates key attack and release from musical time while preserving repeated-note gaps", () => {
  expect(practiceKeyIllumination(120, 120, 119, 1200, 400, 240)).toBe(0);
  expect(practiceKeyIllumination(120, 120, 120, 1200, 400, 240)).toBeGreaterThan(0);
  expect(practiceKeyIllumination(120, 120, 124, 1200, 400, 240)).toBeGreaterThan(practiceKeyIllumination(120, 120, 120, 1200, 400, 240));
  expect(practiceKeyIllumination(120, 120, 230, 1200, 400, 240)).toBeLessThan(practiceKeyIllumination(120, 120, 228, 1200, 400, 240));
  expect(practiceKeyIllumination(120, 120, 239, 1200, 400, 240)).toBe(0);
  expect(practiceKeyIllumination(120, 120, 240, 1200, 400, 240)).toBe(0);
});
it("skips completed notes without skipping sustained notes, and handles backward seeks", () => {
  expect(practiceVisibleStart([10, 100, 100, 130], 20)).toBe(1);
  expect(practiceVisibleStart([10, 100, 100, 130], 100)).toBe(3);
  expect(practiceVisibleStart([10, 100, 100, 130], 0)).toBe(0);
  expect(practiceVisibleStart([], 0)).toBe(0);
});
it("releases key highlights across the four-pixel gap and retriggers at repeated onsets", () => {
  expect(practiceKeyActive(0, 120, 107, 1200, 400)).toBe(true);
  expect(practiceKeyActive(0, 120, 108, 1200, 400)).toBe(false);
  expect(practiceKeyActive(120, 120, 119, 1200, 400)).toBe(false);
  expect(practiceKeyActive(120, 120, 120, 1200, 400)).toBe(true);
  expect(practiceKeyActive(0, 4, 0, 1200, 400)).toBe(true);
  expect(practiceKeyActive(0, 4, 2, 1200, 400)).toBe(false);
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
