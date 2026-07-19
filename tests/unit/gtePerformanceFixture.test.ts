import { describe, expect, it } from "vitest";
import { buildGtePerformanceFixture } from "../../lib/gtePerformanceFixture";

describe("buildGtePerformanceFixture", () => {
  it("creates a deterministic large editor fixture for performance baselines", () => {
    const first = buildGtePerformanceFixture();
    const second = buildGtePerformanceFixture();
    const totalNotes = first.editors.reduce((sum, lane) => sum + lane.notes.length, 0);
    const totalEffects = first.editors.reduce((sum, lane) => sum + (lane.noteEffects || []).length, 0);

    expect(first).toEqual(second);
    expect(first.editors).toHaveLength(5);
    expect(totalNotes).toBeGreaterThanOrEqual(4000);
    expect(totalNotes).toBeLessThanOrEqual(5000);
    expect(totalEffects).toBeGreaterThan(0);
    expect(Math.ceil(first.editors[0].totalFrames / first.editors[0].framesPerMessure)).toBeGreaterThanOrEqual(100);
    expect(first.editors.every((lane) => lane.cutPositionsWithCoords.length >= 100)).toBe(true);
    expect(first.editors.some((lane) => lane.notes.some((note, index) =>
      lane.notes.slice(index + 1).some((next) =>
        next.tab[0] === note.tab[0] &&
        note.startTime < next.startTime + next.length &&
        next.startTime < note.startTime + note.length
      )
    ))).toBe(true);
  });
});
