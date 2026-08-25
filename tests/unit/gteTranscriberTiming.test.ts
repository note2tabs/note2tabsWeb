import { describe, expect, it } from "vitest";
import {
  preserveExistingTimingForOffsetImport,
  stabilizeNewTranscriberTimingMap,
} from "../../lib/gteTranscriberTiming";
import { synthesizeTimingMap } from "../../lib/gteTiming";
import type { CanvasSnapshot } from "../../types/gte";

const canvasWithBpms = (bpms: number[], activeBars: number[]): CanvasSnapshot => {
  const timingMap = synthesizeTimingMap(2, bpms.length * 480, 4, 4);
  timingMap.bars = timingMap.bars.map((bar, index) => ({
    ...bar,
    quarterNoteBpm: bpms[index],
    confidence: 0.9,
    source: "onset_consensus",
  }));
  return {
    id: "canvas-1",
    version: 2,
    secondsPerBar: 2,
    timingMap,
    editors: [
      {
        id: "track-1",
        framesPerMessure: 480,
        fps: 240,
        totalFrames: bpms.length * 480,
        notes: activeBars.map((bar, index) => ({
          id: index + 1,
          startTime: bar * 480 + 60,
          length: 120,
          midiNum: 60,
          tab: [0, 0],
          optimals: [],
        })),
        chords: [],
        cutPositionsWithCoords: [[[0, bpms.length * 480], [2, 0]]],
        optimalsByTime: {},
        maxFret: 22,
      },
    ],
  };
};

describe("transcriber tempo stabilization", () => {
  it("removes an isolated tempo change, especially on an empty bar", () => {
    const canvas = canvasWithBpms([120, 120, 90, 120, 120], [0, 1, 3, 4]);
    const result = stabilizeNewTranscriberTimingMap(canvas);
    expect(result.bars.map((bar) => bar.quarterNoteBpm)).toEqual([120, 120, 120, 120, 120]);
  });

  it("removes an active nine-bar interior tempo segment", () => {
    const bpms = [
      ...Array(12).fill(120),
      ...Array(9).fill(100),
      ...Array(12).fill(120),
    ];
    const canvas = canvasWithBpms(bpms, bpms.map((_, index) => index));
    const result = stabilizeNewTranscriberTimingMap(canvas);
    expect(result.bars.every((bar) => Math.round(bar.quarterNoteBpm) === 120)).toBe(true);
  });

  it("keeps an active ten-bar interior tempo segment", () => {
    const bpms = [
      ...Array(12).fill(120),
      ...Array(10).fill(100),
      ...Array(12).fill(120),
    ];
    const canvas = canvasWithBpms(bpms, bpms.map((_, index) => index));
    const result = stabilizeNewTranscriberTimingMap(canvas);
    expect(result.bars.slice(12, 22).every((bar) => Math.round(bar.quarterNoteBpm) === 100)).toBe(true);
  });

  it("permits a short opening tempo segment for transcription alignment", () => {
    const bpms = [90, 90, ...Array(12).fill(120)];
    const canvas = canvasWithBpms(bpms, bpms.map((_, index) => index));
    const result = stabilizeNewTranscriberTimingMap(canvas);
    expect(result.bars.map((bar) => Math.round(bar.quarterNoteBpm))).toEqual(bpms);
  });

  it("preserves existing-canvas tempo and lets the imported track offset handle placement", () => {
    const existing = canvasWithBpms([114, 114], [0, 1]);
    const imported = canvasWithBpms([114, 114, 132, 132], [0, 1, 2, 3]);
    imported.editors[0].timelineOffsetFrames = 960;
    const result = preserveExistingTimingForOffsetImport(imported, existing);
    expect(result.bars.map((bar) => bar.quarterNoteBpm)).toEqual([114, 114, 114, 114]);
    expect(imported.editors[0].timelineOffsetFrames).toBe(960);
  });
});
