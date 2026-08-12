import { describe, expect, it } from "vitest";
import {
  buildTimingMapMetronomeClicks,
  frameDurationSeconds,
  frameToSeconds,
  normalizeTimingMap,
  secondsToFrame,
  synthesizeTimingMap,
} from "../../lib/gteTiming";
import type { TimingMapV2 } from "../../types/gte";

const variableMap = (): TimingMapV2 => ({
  version: 2,
  framesPerBar: 480,
  audioOffsetSeconds: 0.25,
  bars: [
    {
      id: "bar-1",
      index: 0,
      startFrame: 0,
      endFrame: 480,
      startSeconds: 0,
      endSeconds: 2,
      quarterNoteBpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      anchors: [
        { tick: 120, seconds: 0.4 },
        { tick: 240, seconds: 1 },
        { tick: 360, seconds: 1.6 },
      ],
      confidence: 0.9,
      source: "audio",
    },
    {
      id: "bar-2",
      index: 1,
      startFrame: 480,
      endFrame: 960,
      startSeconds: 2,
      endSeconds: 5,
      quarterNoteBpm: 70,
      timeSignature: { numerator: 7, denominator: 8 },
      anchors: [],
      confidence: 1,
      source: "manual",
    },
  ],
});

describe("TimingMapV2", () => {
  it("synthesizes a backward-compatible uniform map", () => {
    const map = synthesizeTimingMap(3, 960, 4, 4);
    expect(map.bars).toHaveLength(2);
    expect(map.bars[1]).toMatchObject({ startFrame: 480, startSeconds: 3, endSeconds: 6 });
  });

  it("round-trips frames across anchors, tempo changes, offsets, and extrapolation", () => {
    const map = normalizeTimingMap(variableMap(), { totalFrames: 960 });
    expect(frameToSeconds(map, 120)).toBeCloseTo(0.65, 6);
    for (const frame of [0, 60, 120, 240, 360, 480, 720, 960, 1200]) {
      expect(secondsToFrame(map, frameToSeconds(map, frame))).toBeCloseTo(frame, 0);
    }
    expect(frameDurationSeconds(map, 0, 960)).toBeCloseTo(5, 6);
  });

  it("places metronome clicks from each bar's own meter and timing", () => {
    const clicks = buildTimingMapMetronomeClicks({
      timingMap: variableMap(),
      startFrame: 0,
      endFrame: 960,
      countInBars: 1,
    });
    expect(clicks.filter((click) => click.countIn)).toHaveLength(4);
    expect(clicks.filter((click) => !click.countIn)).toHaveLength(11);
    expect(clicks.filter((click) => !click.countIn && click.accent)).toHaveLength(2);
    expect(clicks.find((click) => click.frame === 120 && !click.countIn)?.timeSec).toBeCloseTo(0.4, 6);
  });
});
