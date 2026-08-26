import { normalizePositiveDurationSec } from "../../lib/transcriptionDuration";

describe("normalizePositiveDurationSec", () => {
  it("rounds a valid transcription duration", () => {
    expect(normalizePositiveDurationSec(171.4)).toBe(171);
    expect(normalizePositiveDurationSec("45.8")).toBe(46);
  });

  it("does not turn a missing or zero duration into one second", () => {
    expect(normalizePositiveDurationSec(undefined)).toBeNull();
    expect(normalizePositiveDurationSec(null)).toBeNull();
    expect(normalizePositiveDurationSec(0)).toBeNull();
    expect(normalizePositiveDurationSec("0")).toBeNull();
  });
});
