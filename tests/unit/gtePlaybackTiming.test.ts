import { describe, expect, it } from "vitest";
import {
  MIN_PLAYBACK_SCHEDULE_LEAD_SECONDS,
  getPlaybackScheduleLeadSeconds,
} from "../../lib/gtePlaybackTiming";

describe("getPlaybackScheduleLeadSeconds", () => {
  it("keeps the historical 100 ms lead when latency is unavailable", () => {
    expect(getPlaybackScheduleLeadSeconds(undefined, undefined)).toBe(
      MIN_PLAYBACK_SCHEDULE_LEAD_SECONDS
    );
  });

  it("does not let a small browser-reported latency remove the safe lead", () => {
    expect(getPlaybackScheduleLeadSeconds(0.006, 0.012)).toBe(
      MIN_PLAYBACK_SCHEDULE_LEAD_SECONDS
    );
  });

  it("respects devices that report more than the minimum latency", () => {
    expect(getPlaybackScheduleLeadSeconds(0.08, 0.07)).toBeCloseTo(0.15);
  });

  it("ignores invalid and negative latency values", () => {
    expect(getPlaybackScheduleLeadSeconds(Number.NaN, -1)).toBe(
      MIN_PLAYBACK_SCHEDULE_LEAD_SECONDS
    );
  });
});
