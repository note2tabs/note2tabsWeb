import { expect, it } from "vitest";
import { insertDrumNotationHit, moveDrumNotationHits } from "../../lib/gteDrumNotationEditing";
import { buildDrumNote } from "../../lib/gteDrums";
import { buildDrumNotationScore } from "../../lib/gteDrumNotation";
import type { EditorSnapshot } from "../../types/gte";

const fixture = (): EditorSnapshot => ({ id: "drums", editorType: "drums", totalFrames: 480, framesPerMessure: 480, fps: 240,
  notes: [buildDrumNote({ id: 1, voiceIndex: 6, startTime: 0 })], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} });
it("inserts real drum MIDI events and extends the track without mutating the source", () => {
  const source = fixture(), before = structuredClone(source);
  const next = insertDrumNotationHit(source, 8, 540);
  expect(next.notes[1]).toMatchObject({ id: 2, midiNum: 36, tab: [8, 0], startTime: 540 });
  expect(next.totalFrames).toBe(960);
  expect(source).toEqual(before);
  expect(insertDrumNotationHit(next, 8, 540)).toBe(next);
  expect(buildDrumNotationScore(next).measures).toHaveLength(2);
});
it("moves only selected hits and maps staff movement to instruments, not chromatic MIDI", () => {
  const source = fixture(); source.notes.push(buildDrumNote({ id: 2, voiceIndex: 8, startTime: 120 }));
  const before = structuredClone(source);
  const moved = moveDrumNotationHits(source, [1], 60, 4);
  expect(moved.notes[0]).toMatchObject({ startTime: 60, midiNum: 50, tab: [4, 0] });
  expect(moved.notes[1]).toEqual(source.notes[1]);
  expect(moveDrumNotationHits(source, [1], -60, 0)).toBe(source);
  expect(source).toEqual(before);
});
it("keeps open hi-hat identity when moving horizontally and edits loop sources for repeated hits", () => {
  const source = fixture(); source.notes = [buildDrumNote({ id: 1, voiceIndex: 3, startTime: 0 })];
  expect(moveDrumNotationHits(source, [1], 60, 0).notes[0].midiNum).toBe(46);
  source.totalFrames = 960;
  source.drumLoops = [{ id: "loop", sourceStart: 0, sourceEnd: 240, loopEnd: 960 }];
  const next = insertDrumNotationHit(source, 8, 540);
  expect(next.notes[1].startTime).toBe(60);
  const score = buildDrumNotationScore(next);
  const kicks = score.measures.flatMap(m => m.voices.treble.flat()).flatMap(token => token.sources).filter(event => event.midi === 36);
  expect(kicks.map(event => event.start)).toEqual([60, 300, 540, 780]);
});
