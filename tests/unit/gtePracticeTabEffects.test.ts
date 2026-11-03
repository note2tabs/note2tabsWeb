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
  expect(effects[0].hiddenFretKey).toBe(kind === "bend" ? "n:2" : kind === "release" ? "n:1" : undefined);
  if (effects[0].arrow) {
    const shaft = effects[0].path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const arrow = effects[0].arrow.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(shaft.at(-2)! - arrow[2]).toBeCloseTo(0.25); // Small optical left offset of the head.
    expect(shaft.at(-1)! - arrow[3]).toBe(kind === "bend" ? 3 : -3);
    expect(shaft.at(-4)).toBe(shaft.at(-2)); // Final tangent stays vertical.
  }
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

it.each([2, 16, 48, 300].flatMap(span => [false,true].map(release => ({span,release}))))
  ('keeps a compact turn and straight arrow shaft at span $span (release=$release)', ({span,release}) => {
    const snapshot = fixture(0,release ? 14 : 12,release ? 12 : 14);
    const layout = buildPracticeTabLayout(snapshot,800);
    layout.frets[0].x=60; layout.frets[1].x=60+span;
    const effect=buildPracticeTabEffects(snapshot,layout)[0];
    expect(effect).toBeDefined();
    const coordinates=effect.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const turnStart=Number(effect.path.match(/H(-?[\d.]+)/)![1]);
    const x=coordinates.at(-2)!, shaftEnd=coordinates.at(-1)!, curveX=coordinates.at(-4)!, curveEnd=coordinates.at(-3)!;
    expect(x).toBe(curveX);
    expect(shaftEnd-curveEnd).toBe(release ? 4 : -4);
    expect(x-turnStart).toBeLessThanOrEqual(18);
    expect(x-turnStart).toBeGreaterThan(0);
    expect(effect.arrow).toBeDefined(); expect(effect.label).toBe('full');
  });

it('joins a bend/release chain at the hidden pitch instead of leaving a fret-width hole',()=>{
  const snapshot=fixture(0,12,14);
  snapshot.notes.push({...snapshot.notes[0],id:3,startTime:240});
  snapshot.noteEffects!.push({id:2,type:0,startNoteId:2,endNoteId:3,noteEffectLabel:'b'});
  const layout=buildPracticeTabLayout(snapshot,800), effects=buildPracticeTabEffects(snapshot,layout);
  const raised=layout.frets.find(note=>note.key==='n:2')!;
  expect(effects.map(effect=>effect.kind)).toEqual(['bend','release']);
  expect(effects.every(effect=>effect.hiddenFretKey==='n:2')).toBe(true);
  const bendEnd=effects[0].path.match(/-?\d+(?:\.\d+)?/g)!.map(Number).at(-2);
  const releaseStart=Number(effects[1].path.match(/^M(-?[\d.]+)/)![1]);
  expect(bendEnd).toBeCloseTo(raised.x);
  expect(releaseStart).toBeCloseTo(raised.x);
});

it.each([false,true])('keeps a bend visible when it crosses bars and wraps at narrow widths (release=%s)', release=>{
  const snapshot=fixture(0,release ? 14 : 12,release ? 12 : 14);
  snapshot.totalFrames=960;
  snapshot.notes[0].startTime=450; snapshot.notes[1].startTime=480;
  const layout=buildPracticeTabLayout(snapshot,180), effects=buildPracticeTabEffects(snapshot,layout);
  expect(layout.frets[0].row).not.toBe(layout.frets[1].row);
  expect(effects).toHaveLength(2);
  expect(effects.filter(effect=>effect.arrow)).toHaveLength(1);
  expect(effects.some(effect=>effect.label==='full')).toBe(true);
  expect(effects.every(effect=>!effect.path.match(/NaN|Infinity/))).toBe(true);
});
