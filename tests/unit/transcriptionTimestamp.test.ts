import { describe, expect, it } from "vitest";
import { formatTimestamp, maskTimestampInput, parseTimestampInput } from "../../lib/transcriptionTimestamp";

describe("clip timestamp input (digits fill in from the right)", () => {
  const typed = (keys: string) => { let shown = ""; for (const key of keys) shown = maskTimestampInput(shown + key); return shown; };
  it("turns 14 into 0:14 and 310 into 3:10 as you type", () => {
    expect(typed("14")).toBe("0:14");
    expect(typed("310")).toBe("3:10");
    expect(["1", "10", "100", "1000"].map(typed)).toEqual(["0:01", "0:10", "1:00", "10:00"]);
  });
  it("behaves identically when typing 1:30 literally, pasting, or backspacing", () => {
    expect(typed("1:30")).toBe("1:30");
    expect(maskTimestampInput("12:34")).toBe("12:34");
    expect(maskTimestampInput("3:1")).toBe("0:31"); // backspace from 3:10
    expect(maskTimestampInput("0:03")).toBe("0:03");
    expect(maskTimestampInput("")).toBe("");
    expect(maskTimestampInput("abc")).toBe("");
  });
  it("converts the displayed text to seconds, carrying seconds above 59", () => {
    expect(parseTimestampInput("3:10")).toBe(190);
    expect(parseTimestampInput("0:14")).toBe(14);
    expect(parseTimestampInput("1:00")).toBe(60);
    expect(parseTimestampInput("0:75")).toBe(75);
    expect(parseTimestampInput("")).toBeNull();
  });
  it("keeps every digit while seconds are temporarily over 59", () => {
    expect(typed("75")).toBe("0:75");
    expect(typed("755")).toBe("7:55");
  });
  it("formats normalised values", () => {
    expect(formatTimestamp(60)).toBe("1:00");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(75)).toBe("1:15");
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
