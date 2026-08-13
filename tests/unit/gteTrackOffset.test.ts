import { describe, expect, it } from "vitest";
import { offsetTrackToFrame } from "../../lib/gteTrackOffset";
import type { EditorSnapshot } from "../../types/gte";

const lane = (): EditorSnapshot => ({
  id: "track-1",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 960,
  timelineOffsetFrames: 0,
  notes: [{ id: 1, startTime: 120, length: 60, midiNum: 60, tab: [0, 0], optimals: [] }],
  chords: [{ id: 2, startTime: 240, length: 120, originalMidi: [60], currentTabs: [[0, 0]], ogTabs: [[0, 0]] }],
  drumLoops: [{ id: "loop-1", sourceStart: 0, sourceEnd: 480, loopEnd: 960 }],
  cutPositionsWithCoords: [[[0, 960], [2, 0]]],
  optimalsByTime: {},
  tabRef: [],
});

describe("track timeline offset", () => {
  it("moves every time-based track item by whole timeline offsets", () => {
    const shifted = offsetTrackToFrame(lane(), 960);
    expect(shifted.timelineOffsetFrames).toBe(960);
    expect(shifted.notes[0].startTime).toBe(1080);
    expect(shifted.chords[0].startTime).toBe(1200);
    expect(shifted.drumLoops?.[0]).toMatchObject({ sourceStart: 960, sourceEnd: 1440, loopEnd: 1920 });
    expect(shifted.cutPositionsWithCoords[0][0]).toEqual([960, 1920]);
    expect(shifted.totalFrames).toBe(1920);
  });

  it("moves a previously offset track back without crossing time zero", () => {
    const shifted = offsetTrackToFrame(lane(), 960);
    const restored = offsetTrackToFrame(shifted, 0);
    expect(restored).toMatchObject({ timelineOffsetFrames: 0, totalFrames: 960 });
    expect(restored.notes[0].startTime).toBe(120);
    expect(restored.cutPositionsWithCoords[0][0]).toEqual([0, 960]);
  });
});
