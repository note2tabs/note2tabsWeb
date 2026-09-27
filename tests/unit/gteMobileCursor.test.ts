import { describe, expect, it } from "vitest";

import {
  isMobileTimelineTapEligible,
  isSameMobileGridCursor,
} from "../../lib/gteMobileCursor";

describe("mobile GTE cursor taps", () => {
  it("keeps an empty timeline or visible cursor tap eligible", () => {
    expect(isMobileTimelineTapEligible(false)).toBe(true);
  });

  it("leaves note taps to note selection", () => {
    expect(isMobileTimelineTapEligible(true)).toBe(false);
  });

  it("starts add-note only on a second tap of the current cursor cell", () => {
    const cursor = { time: 240, stringIndex: 2 };

    expect(isSameMobileGridCursor(cursor, { time: 240, stringIndex: 2 })).toBe(true);
    expect(isSameMobileGridCursor(cursor, { time: 360, stringIndex: 2 })).toBe(false);
    expect(isSameMobileGridCursor(cursor, { time: 240, stringIndex: 3 })).toBe(false);
    expect(isSameMobileGridCursor(null, { time: 240, stringIndex: 2 })).toBe(false);
  });
});
