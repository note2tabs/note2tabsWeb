import { describe, expect, it } from "vitest";
import {
  materializeDrumLoopNotes,
  normalizeDrumLoops,
  preserveDrumLoopsAcrossCanvasUpdate,
  removeNotesCoveredByLoopRepeats,
} from "../../lib/gteDrumLoops";
import type { CanvasSnapshot, DrumLoopRegion, Note } from "../../types/gte";

const note = (id: number, startTime: number, voice = 4): Note => ({
  id,
  startTime,
  length: 30,
  midiNum: 36 + voice,
  tab: [voice, 0],
  optimals: [[voice, 0]],
});

describe("drum loop regions", () => {
  it("normalizes persistent loop boundaries", () => {
    expect(
      normalizeDrumLoops(
        [{ id: "loop-a", sourceStart: -10, sourceEnd: 480, loopEnd: 9999 }],
        1440
      )
    ).toEqual([{ id: "loop-a", sourceStart: 0, sourceEnd: 480, loopEnd: 1440 }]);
  });

  it("materializes virtual repeats from editable source notes", () => {
    const loop: DrumLoopRegion = {
      id: "loop-a",
      sourceStart: 0,
      sourceEnd: 240,
      loopEnd: 720,
    };
    const rendered = materializeDrumLoopNotes(
      [note(1, 0), note(2, 120)],
      [loop],
      960
    );

    expect(rendered.map((entry) => entry.note.startTime)).toEqual([
      0, 120, 240, 360, 480, 600,
    ]);
    expect(rendered.filter((entry) => entry.virtual)).toHaveLength(4);
  });

  it("replaces physical notes beneath repeated coverage", () => {
    const loop: DrumLoopRegion = {
      id: "loop-a",
      sourceStart: 0,
      sourceEnd: 240,
      loopEnd: 720,
    };
    const physical = [note(1, 0), note(2, 300), note(3, 800)];

    expect(removeNotesCoveredByLoopRepeats(physical, [loop]).map((entry) => entry.id)).toEqual([
      1, 3,
    ]);
    expect(
      materializeDrumLoopNotes(physical, [loop], 960).some(
        (entry) => !entry.virtual && entry.note.id === 2
      )
    ).toBe(false);
  });

  it("preserves loops when a save response omits them", () => {
    const loop: DrumLoopRegion = {
      id: "loop-a",
      sourceStart: 0,
      sourceEnd: 240,
      loopEnd: 720,
    };
    const lane = (drumLoops?: DrumLoopRegion[]) =>
      ({ id: "drums-1", totalFrames: 960, notes: [], chords: [], drumLoops }) as any;
    const current = { id: "canvas-1", editors: [lane([loop])] } as CanvasSnapshot;
    const saved = { id: "canvas-1", editors: [lane()] } as CanvasSnapshot;

    expect(
      preserveDrumLoopsAcrossCanvasUpdate(saved, current).editors[0].drumLoops
    ).toEqual([loop]);
  });
});
