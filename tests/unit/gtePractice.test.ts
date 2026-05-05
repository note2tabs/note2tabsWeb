import { describe, expect, it } from "vitest";
import {
  buildMetronomeClicks,
  equalPowerPanGains,
  frameDeltaToSeconds,
  nextSpeedTrainerValue,
  normalizePlaybackSpeed,
  normalizeTrackPan,
  resolvePracticeLoopRange,
} from "../../lib/gtePractice";

describe("gte practice helpers", () => {
  it("resolves selected bars to a loop range", () => {
    expect(resolvePracticeLoopRange([3, 1, 2], 480, 2400)).toEqual({
      startFrame: 480,
      endFrame: 1920,
    });
  });

  it("returns no loop range for an empty selection", () => {
    expect(resolvePracticeLoopRange([], 480, 2400)).toBeNull();
  });

  it("clamps the loop end to the timeline end", () => {
    expect(resolvePracticeLoopRange([3, 4], 480, 2000)).toEqual({
      startFrame: 1440,
      endFrame: 2000,
    });
  });

  it("scales frame duration by playback speed", () => {
    expect(frameDeltaToSeconds(480, 240, 1)).toBe(2);
    expect(frameDeltaToSeconds(480, 240, 0.5)).toBe(4);
    expect(frameDeltaToSeconds(480, 240, 1.5)).toBeCloseTo(1.333, 3);
  });

  it("normalizes invalid playback speeds", () => {
    expect(normalizePlaybackSpeed(0)).toBe(1);
    expect(normalizePlaybackSpeed("bad")).toBe(1);
    expect(normalizePlaybackSpeed(10)).toBe(2);
  });

  it("steps speed trainer toward its target", () => {
    expect(nextSpeedTrainerValue(1)).toBe(1.05);
    expect(nextSpeedTrainerValue(1.49)).toBe(1.5);
  });

  it("normalizes track pan", () => {
    expect(normalizeTrackPan(-2)).toBe(-1);
    expect(normalizeTrackPan(2)).toBe(1);
    expect(normalizeTrackPan("bad")).toBe(0);
  });

  it("calculates equal-power pan gains", () => {
    expect(equalPowerPanGains(-1).leftGain).toBeCloseTo(1);
    expect(equalPowerPanGains(-1).rightGain).toBeCloseTo(0);
    expect(equalPowerPanGains(0).leftGain).toBeCloseTo(Math.SQRT1_2);
    expect(equalPowerPanGains(0).rightGain).toBeCloseTo(Math.SQRT1_2);
    expect(equalPowerPanGains(1).leftGain).toBeCloseTo(0);
    expect(equalPowerPanGains(1).rightGain).toBeCloseTo(1);
  });

  it("builds metronome clicks for the playback range", () => {
    const clicks = buildMetronomeClicks({
      startFrame: 480,
      endFrame: 960,
      framesPerBar: 480,
      beatsPerBar: 4,
      fps: 240,
      playbackSpeed: 1,
    });

    expect(clicks.map((click) => click.frame)).toEqual([480, 600, 720, 840]);
    expect(clicks.map((click) => click.accent)).toEqual([true, false, false, false]);
    expect(clicks.map((click) => click.timeSec)).toEqual([0, 0.5, 1, 1.5]);
  });

  it("adds one-bar count-in clicks before playback start", () => {
    const clicks = buildMetronomeClicks({
      startFrame: 480,
      endFrame: 960,
      framesPerBar: 480,
      beatsPerBar: 4,
      fps: 240,
      playbackSpeed: 1,
      countInBars: 1,
    });

    expect(clicks.map((click) => click.frame)).toEqual([0, 120, 240, 360, 480, 600, 720, 840]);
    expect(clicks.slice(0, 4).map((click) => click.timeSec)).toEqual([-2, -1.5, -1, -0.5]);
  });
});
