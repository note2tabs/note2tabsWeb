import { describe, expect, it } from "vitest";
import {
  clampFileClipEnd,
  clampFileClipStart,
  clampYoutubeClipEnd,
  clampYoutubeClipStart,
  getDefaultFileClipRange,
  isFileClipRangeValid,
  isYoutubeClipRangeValid,
  resolveYoutubeClipDuration,
} from "../../lib/transcriptionClip";

describe("transcription file clip limits", () => {
  it("defaults free users to a one minute clip for longer files", () => {
    expect(getDefaultFileClipRange(240, false)).toEqual({ start: 0, end: 60 });
  });

  it("defaults admins and paid users to the full known file length", () => {
    expect(getDefaultFileClipRange(240, true)).toEqual({ start: 0, end: 240 });
  });

  it("does not default admins to a 5 second clip when metadata is missing", () => {
    expect(getDefaultFileClipRange(null, true)).toEqual({ start: 0, end: 60 });
  });

  it("rejects free file clips over one minute", () => {
    expect(isFileClipRangeValid(0, 60, 240, false)).toBe(true);
    expect(isFileClipRangeValid(0, 61, 240, false)).toBe(false);
  });

  it("allows admins to choose clips longer than one minute within the file length", () => {
    expect(isFileClipRangeValid(0, 180, 240, true)).toBe(true);
    expect(isFileClipRangeValid(0, 241, 240, true)).toBe(false);
  });

  it("clamps free users to one minute when start time changes", () => {
    expect(clampFileClipStart(120, 220, 300, false)).toEqual({ start: 120, end: 180 });
  });

  it("does not clamp admins to one minute when start time changes", () => {
    expect(clampFileClipStart(120, 220, 300, true)).toEqual({ start: 120, end: 220 });
  });

  it("clamps free end time to one minute after the selected start", () => {
    expect(clampFileClipEnd(30, 180, 300, false)).toBe(90);
  });

  it("lets admins set longer end times up to the known duration", () => {
    expect(clampFileClipEnd(30, 180, 300, true)).toBe(180);
    expect(clampFileClipEnd(30, 360, 300, true)).toBe(300);
  });
});

describe("YouTube clip limits", () => {
  it("keeps free users limited to 30 seconds", () => {
    expect(isYoutubeClipRangeValid(0, 30, false)).toBe(true);
    expect(isYoutubeClipRangeValid(0, 31, false)).toBe(false);
    expect(resolveYoutubeClipDuration(0, 90, false)).toBe(30);
  });

  it("allows Premium and staff users to select longer clips", () => {
    expect(isYoutubeClipRangeValid(0, 300, true)).toBe(true);
    expect(resolveYoutubeClipDuration(60, 300, true)).toBe(240);
  });

  it.each([[false, 30], [true, 600], [true, 1200]] as const)("allows a late start while enforcing a %s/%s duration", (paid, limit) => {
    expect(isYoutubeClipRangeValid(3600, 3600 + limit, paid, limit)).toBe(true);
    expect(isYoutubeClipRangeValid(3600, 3601 + limit, paid, limit)).toBe(false);
    expect(clampYoutubeClipEnd(3600, 7200, paid, limit)).toBe(3600 + limit);
    expect(clampYoutubeClipStart(3600, 0, paid, limit)).toEqual({start:3600,end:3630});
  });
  it.each([[-1, 20], [NaN, 20], [0, Infinity], [Infinity, Infinity], [20, 20]])("rejects invalid timestamps %s–%s", (start, end) => {
    expect(isYoutubeClipRangeValid(start, end, true)).toBe(false);
  });

  it("clamps free ranges without shortening Premium ranges", () => {
    expect(clampYoutubeClipEnd(120, 300, false)).toBe(150);
    expect(clampYoutubeClipEnd(120, 300, true)).toBe(300);
    expect(clampYoutubeClipStart(570, 590, false)).toEqual({ start: 570, end: 590 });
    expect(clampYoutubeClipStart(570, 300, true)).toEqual({ start: 570, end: 600 });
  });
});
