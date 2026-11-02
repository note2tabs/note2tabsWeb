import { expect, it } from "vitest";
import { buildPracticeTabEffects } from "../../lib/gtePracticeTabEffects";
import { buildPracticeTabLayout } from "../../lib/gtePracticeTabLayout";
import type { EditorSnapshot } from "../../types/gte";

function fixture(type: 0 | 1 | 2, from: number, to: number): EditorSnapshot {
  return {id: "effects", framesPerMessure: 480, totalFrames: 480, fps: 240,
    notes: [from, to].map((fret, i) => ({id: i + 1, startTime: i * 120, length: 120, midiNum: 64 + fret, tab: [0, fret], optimals: []})),
    chords: [], cutPositionsWithCoords: [], optimalsByTime: {},
    noteEffects: [{id: 1, type, startNoteId: 1, endNoteId: 2, noteEffectLabel: ""}],
  };
}

it.each([
  [1, 5, 7, "hammer", "H"], [1, 7, 5, "pull", "P"],
  [0, 5, 6, "bend", "½"], [0, 5, 7, "bend", "full"], [0, 5, 8, "bend", "1½"],
  [0, 7, 5, "release", "full"], [2, 5, 7, "slide", undefined], [2, 7, 5, "slide", undefined],
] as const)("engraves effect %s from fret %s to %s", (type, from, to, kind, label) => {
  const snapshot = fixture(type, from, to), original = structuredClone(snapshot);
  const layout = buildPracticeTabLayout(snapshot, 800), geometry = structuredClone(layout);
  const effects = buildPracticeTabEffects(snapshot, layout);
  expect(effects).toHaveLength(1);
  expect(effects[0].kind).toBe(kind); expect(effects[0].label).toBe(label);
  expect(effects[0].path).not.toMatch(/NaN|Infinity/);
  expect(Boolean(effects[0].arrow)).toBe(kind === "bend" || kind === "release");
  expect(snapshot).toEqual(original); expect(layout).toEqual(geometry);
});

it("keeps wrapped connections inside each system and bends held across the break", () => {
  const snapshot = fixture(0, 5, 7), layout = buildPracticeTabLayout(snapshot, 200);
  const first = layout.frets[0], second = layout.frets[1];
  first.row = 0; first.x = 70;
  second.row = 1; second.x = 100;
  const measure = layout.measures[0];
  layout.measures = [{...measure, x: 32, width: 150, row: 0}, {...measure, x: 32, width: 150, row: 1}];
  const effects = buildPracticeTabEffects(snapshot, layout);
  expect(effects.map(effect => effect.row)).toEqual([0, 1]);
  expect(effects[0].arrow).toBeDefined();
  expect(effects[1].held).toBe(true); expect(effects[1].arrow).toBeUndefined();
  expect(effects[1].label).toBeUndefined();
});

it("ignores missing notes, cross-string links and equal pitches", () => {
  const snapshot = fixture(1, 5, 7);
  snapshot.notes[1].tab[0] = 1;
  expect(buildPracticeTabEffects(snapshot, buildPracticeTabLayout(snapshot, 800))).toEqual([]);
  snapshot.notes[1].tab = [0, 5];
  expect(buildPracticeTabEffects(snapshot, buildPracticeTabLayout(snapshot, 800))).toEqual([]);
  snapshot.notes.pop();
  expect(buildPracticeTabEffects(snapshot, buildPracticeTabLayout(snapshot, 800))).toEqual([]);
});
