import { describe, expect, it } from "vitest";
import { buildGteStressFixture } from "../../lib/gtePerformanceFixture";
import {
  appendBoundedHistory,
  replaceCanvasLane,
  visibleRowRange,
  windowTimelineEvents,
} from "../../lib/gteEditorPerformance";

describe("large editor update boundaries", () => {
  it("windows a 10-lane × 10,000-note score without modifying source lanes", () => {
    const fixture = buildGteStressFixture();
    const laneReferences = [...fixture.editors];
    const noteReferences = fixture.editors.map((lane) => lane.notes);
    const visibleByLane = fixture.editors.map((lane) =>
      windowTimelineEvents(lane.notes, { startFrame: 240_000, endFrame: 241_920 })
    );

    expect(fixture.editors).toHaveLength(10);
    expect(fixture.editors.every((lane) => lane.notes.length === 10_000)).toBe(true);
    expect(fixture.editors.reduce((count, lane) => count + lane.notes.length, 0)).toBe(100_000);
    expect(visibleByLane.every((events) => events.length < 100)).toBe(true);
    fixture.editors.forEach((lane, index) => {
      expect(lane).toBe(laneReferences[index]);
      expect(lane.notes).toBe(noteReferences[index]);
    });
  });

  it("updates one note without replacing or serializing unrelated lanes", () => {
    const fixture = buildGteStressFixture();
    const targetIndex = 4;
    const target = fixture.editors[targetIndex];
    const changedLane = {
      ...target,
      notes: target.notes.map((note, index) =>
        index === 123 ? { ...note, startTime: note.startTime + 30 } : note
      ),
    };
    const updated = replaceCanvasLane(fixture, target.id, changedLane);

    expect(updated).not.toBe(fixture);
    expect(updated.editors[targetIndex]).toBe(changedLane);
    updated.editors.forEach((lane, index) => {
      if (index !== targetIndex) expect(lane).toBe(fixture.editors[index]);
    });

    const laneAutosavePayload = JSON.stringify(changedLane);
    expect(laneAutosavePayload).toContain(target.id);
    fixture.editors.forEach((lane, index) => {
      if (index !== targetIndex) expect(laneAutosavePayload).not.toContain(lane.id);
    });
  });

  it("keeps bounded undo snapshots through structural sharing", () => {
    const first = { revision: 1 };
    const second = { revision: 2 };
    const third = { revision: 3 };
    const history = appendBoundedHistory(
      appendBoundedHistory(appendBoundedHistory([], first, 2), second, 2),
      third,
      2
    );

    expect(history).toEqual([second, third]);
    expect(history[0]).toBe(second);
    expect(history[1]).toBe(third);
  });

  it("handles zero- and one-entry history limits without retaining older snapshots", () => {
    const older = { revision: 1 };
    const newest = { revision: 2 };

    expect(appendBoundedHistory([older], newest, 0)).toEqual([]);
    expect(appendBoundedHistory([older], newest, 1)).toEqual([newest]);
  });
});

describe("stacked-row windowing", () => {
  it("mounts only rows near the viewport of a 500-row track and moves with scrolling", () => {
    const top = visibleRowRange(0, 900, 150, 500, 700);
    expect(top.first).toBe(0);
    expect(top.last - top.first + 1).toBeLessThan(20);
    const scrolled = visibleRowRange(-30_000, 900, 150, 500, 700); // 200 rows down
    expect(scrolled.first).toBeGreaterThan(190);
    expect(scrolled.first).toBeLessThan(scrolled.last);
    expect(scrolled.last - scrolled.first + 1).toBeLessThan(20);
  });
  it("stays in range at the ends, and does not change within one row of scrolling", () => {
    expect(visibleRowRange(-1e9, 900, 150, 10, 700)).toEqual({ first: 9, last: 9 });
    expect(visibleRowRange(1e9, 900, 150, 10, 700)).toEqual({ first: 0, last: 0 });
    expect(visibleRowRange(-1000, 900, 150, 500, 700)).toEqual(visibleRowRange(-1010, 900, 150, 500, 700));
  });
});
