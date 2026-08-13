import { describe, expect, it } from "vitest";
import {
  buildEditorTabView,
  EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH,
} from "../../lib/gteEditorTabView";
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
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH,
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH + view.barWidth,
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH + view.barWidth * 2,
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH + view.barWidth * 3,
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH + view.barWidth * 4,
    ];
    view.barLines.forEach((line, index) => {
      expect(line.x).toBeCloseTo(expectedBarLines[index], 8);
    });
  });

  it("collapses empty practice bars and uses shared readable widths for populated bars", () => {
    const view = buildEditorTabView(baseSnapshot(), {
      framesPerBar: 480,
      beatsPerBar: 7,
      scale: 1,
      playheadFrame: 0,
      minBarCount: 4,
      variableBarWidths: true,
    });

    expect(view.barWidths).toEqual([112, 112, 112, 42]);
    expect(view.barStartXs).toEqual([
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH,
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH + 112,
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH + 224,
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH + 336,
      EDITOR_TAB_VIEW_LEFT_LABEL_WIDTH + 378,
    ]);
    expect(view.cursorX).toBe(view.placements.find((placement) => placement.startTime === 0)?.x);
  });

  it("shares one compact width across consecutive empty practice bars", () => {
    const snapshot = baseSnapshot();
    snapshot.notes = snapshot.notes.slice(0, 1);
    snapshot.chords = [];
    const view = buildEditorTabView(snapshot, {
      framesPerBar: 480,
      beatsPerBar: 7,
      scale: 1,
      playheadFrame: 0,
      minBarCount: 4,
      variableBarWidths: true,
      collapseConsecutiveEmptyBars: true,
    });

    expect(view.barWidths[0]).toBe(112);
    expect(view.barWidths.slice(1)).toEqual([24, 24, 24]);
    expect(view.barStartXs[4] - view.barStartXs[1]).toBe(72);
  });

  it("spreads dense practice notes apart and keeps dense bars the same width", () => {
    const snapshot = baseSnapshot();
    snapshot.totalFrames = 960;
    snapshot.chords = [];
    snapshot.notes = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      startTime: (index < 6 ? 0 : 480) + (index % 6) * 60,
      length: 30,
      midiNum: 60 + index,
      tab: [index % 6, index + 1] as [number, number],
      optimals: [],
    }));
    const view = buildEditorTabView(snapshot, {
      framesPerBar: 480,
      beatsPerBar: 8,
      scale: 1,
      playheadFrame: 0,
      variableBarWidths: true,
    });

    expect(view.barWidths[0]).toBe(view.barWidths[1]);
    expect(view.barWidths[0]).toBeGreaterThanOrEqual(176);
    const firstBarXs = view.placements
      .filter((placement) => placement.startTime < 480)
      .map((placement) => placement.x);
    firstBarXs.slice(1).forEach((x, index) => {
      expect(x - firstBarXs[index]).toBeGreaterThanOrEqual(20);
    });
  });
});
