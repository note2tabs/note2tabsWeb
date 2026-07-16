import { describe, expect, it } from "vitest";
import { buildEditorTabView } from "../../lib/gteEditorTabView";
import type { EditorSnapshot } from "../../types/gte";

const baseSnapshot = (): EditorSnapshot => ({
  id: "ed-1",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 1920,
  timeSignature: 7,
  notes: [
    { id: 1, startTime: 0, length: 120, midiNum: 60, tab: [5, 3], optimals: [] },
    { id: 2, startTime: 480, length: 120, midiNum: 62, tab: [4, 0], optimals: [] },
  ],
  chords: [
    {
      id: 3,
      startTime: 960,
      length: 480,
      originalMidi: [60, 64, 67],
      currentTabs: [[5, 3]],
      ogTabs: [[5, 3]],
    },
  ],
  cutPositionsWithCoords: [[[0, 1920], [0, 0]]],
  optimalsByTime: {},
});

describe("gte editor tab view", () => {
  it("uses the same per-bar width as the frame timeline scale", () => {
    const framesPerBar = 480;
    const scale = 3.37;
    const view = buildEditorTabView(baseSnapshot(), {
      framesPerBar,
      beatsPerBar: 7,
      scale,
      playheadFrame: 0,
      minBarCount: 4,
    });

    expect(view.barWidth).toBe(framesPerBar * scale);
    const expectedBarLines = [
      30,
      30 + view.barWidth,
      30 + view.barWidth * 2,
      30 + view.barWidth * 3,
      30 + view.barWidth * 4,
    ];
    view.barLines.forEach((line, index) => {
      expect(line.x).toBeCloseTo(expectedBarLines[index], 8);
    });
  });
});
