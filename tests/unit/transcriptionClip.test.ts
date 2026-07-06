import { describe, expect, it } from "vitest";
import {
  clampFileClipEnd,
  clampFileClipStart,
  getDefaultFileClipRange,
  isFileClipRangeValid,
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
