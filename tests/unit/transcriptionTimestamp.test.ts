import { describe, expect, it } from "vitest";
import { formatTimestamp, parseTimestampInput, sanitizeTimestampInput } from "../../lib/transcriptionTimestamp";

describe("clip timestamp input", () => {
  it("parses every prefix of '1:00' as typed, so no step is rewritten or rejected oddly", () => {
    expect(["1", "1:", "1:0", "1:00"].map(parseTimestampInput)).toEqual([1, null, 60, 60]);
  });
  it("accepts the ways people actually type a time", () => {
    expect(parseTimestampInput("90")).toBe(90);
    expect(parseTimestampInput("1:30")).toBe(90);
    expect(parseTimestampInput("01:30")).toBe(90);
    expect(parseTimestampInput(" 1:3 ")).toBe(63);
    expect(parseTimestampInput("1:02:03")).toBe(3723);
    expect(parseTimestampInput("1m30s")).toBe(90);
    expect(parseTimestampInput("2m")).toBe(120);
    expect(parseTimestampInput("45s")).toBe(45);
  });
  it("rejects incomplete or impossible times instead of guessing", () => {
    for (const bad of ["", "   ", ":", "1:", "1:60", "abc", "1:2:3:4", "1::2"]) expect(parseTimestampInput(bad)).toBeNull();
  });
  it("never inserts characters while typing", () => {
    expect(sanitizeTimestampInput("1")).toBe("1");
    expect(sanitizeTimestampInput("10")).toBe("10");
    expect(sanitizeTimestampInput("1:0")).toBe("1:0");
    expect(sanitizeTimestampInput("1a:0 0")).toBe("1:00");
  });
  it("formats normalised values, including hours", () => {
    expect(formatTimestamp(60)).toBe("1:00");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(3723)).toBe("1:02:03");
  });
});

import { autoAdjustedFileClipEnd } from "../../lib/transcriptionClip";
describe("automatic clip-end adjustment", () => {
  const base = { startTime: 0, endTime: 60, fileDurationSec: 180, isPremiumUser: true, freeLimitSec: 60 };
  it("extends an untouched Pro default to the whole file once the length is known", () => {
    expect(autoAdjustedFileClipEnd({ ...base, edited: false })).toBe(180);
  });
  it("does not rewrite what the user is typing: '1:0' (= the 60 s default) must stay 1:00, not jump to 3:00", () => {
    expect(autoAdjustedFileClipEnd({ ...base, edited: true })).toBeNull();
  });
  it("only clamps a free user's untouched range; a typed value is clamped later, on blur", () => {
    expect(autoAdjustedFileClipEnd({ ...base, isPremiumUser: false, endTime: 120, edited: false })).toBe(60);
    expect(autoAdjustedFileClipEnd({ ...base, isPremiumUser: false, endTime: 63, edited: true })).toBeNull();
  });
  it("leaves unknown lengths, non-zero starts and missing ends alone", () => {
    expect(autoAdjustedFileClipEnd({ ...base, edited: false, fileDurationSec: null })).toBeNull();
    expect(autoAdjustedFileClipEnd({ ...base, edited: false, startTime: 5 })).toBeNull();
    expect(autoAdjustedFileClipEnd({ ...base, edited: false, endTime: null })).toBeNull();
  });
});
