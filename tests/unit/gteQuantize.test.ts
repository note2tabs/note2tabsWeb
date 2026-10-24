import { describe, expect, it } from "vitest";
import { quantizeItems } from "../../lib/gteQuantize";

type Items = Parameters<typeof quantizeItems>[0];
const run = (items: Items, options: Partial<Parameters<typeof quantizeItems>[1]> = {}) => quantizeItems(items, { step: 30, ...options });

describe("quantizeItems", () => {
  it("keeps near-simultaneous onsets together on one gridline", () => {
    const out = run([{ id: 1, start: 44, length: 100 }, { id: 2, start: 46, length: 100 }, { id: 3, start: 51, length: 100 }]);
    expect(new Set([1, 2, 3].map((id) => out.get(id)!.start))).toEqual(new Set([60]));
  });
  it("snaps ends to the grid instead of rounding lengths independently", () => {
    expect(run([{ id: 1, start: 28, length: 100, keys: ["a"] }]).get(1)).toEqual({ start: 30, length: 90 });
  });
  it("never overlaps events that share a key", () => {
    const out = run([{ id: 1, start: 0, length: 100, keys: ["s1"] }, { id: 2, start: 62, length: 60, keys: ["s1"] }, { id: 3, start: 62, length: 60, keys: ["s2"] }]);
    const a = out.get(1)!, b = out.get(2)!;
    expect(a.start + a.length).toBeLessThanOrEqual(b.start);
    expect(out.get(3)).toEqual({ start: 60, length: 60 });
  });
  it("drops duplicates created by snapping and is idempotent", () => {
    const out = run([{ id: 1, start: 29, length: 60, keys: ["p"] }, { id: 2, start: 32, length: 30, keys: ["p"] }]);
    expect(out.get(2)).toBeNull();
    const first = out.get(1)!, again = run([{ id: 1, start: first.start, length: first.length, keys: ["p"] }]);
    expect(again.get(1)).toEqual(first);
  });
  it("moves toward the grid at partial strength and leaves aligned notes alone", () => {
    expect(run([{ id: 1, start: 40, length: 60 }], { strength: .5 }).get(1)!.start).toBe(35);
    expect(run([{ id: 1, start: 60, length: 60 }], { strength: .5 }).get(1)).toEqual({ start: 60, length: 60 });
  });
  it("optionally joins same-pitch fragments", () => {
    const out = run([{ id: 1, start: 0, length: 55, keys: ["p"] }, { id: 2, start: 60, length: 60, keys: ["p"] }], { mergeFragments: true });
    expect(out.get(2)).toBeNull();
    expect(out.get(1)).toEqual({ start: 0, length: 120 });
  });
});
