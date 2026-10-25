import { describe, expect, it } from "vitest";
import { allocateNotationHands } from "../../lib/gteNotationHands";
import { scoreEvents } from "../../lib/gteNotation";
import { buildNotationScore } from "../../lib/gteNotationScore";
import type { EditorSnapshot } from "../../types/gte";

const events = (pitches: number[], start = 0, length = 96) => pitches.map((midi,i) => ({key:`${start}:${i}`,midi,start,length,staff:midi < 60 ? "bass" as const : "treble" as const}));
describe("contextual notation hand allocation", () => {
  it("does not force an upper chord into the left hand just because it is below middle C", () => {
    const source = events([36,48,55,59,62]), before = structuredClone(source);
    const result = allocateNotationHands(source,new Set());
    expect(result.filter(note => note.staff === "bass").map(note => note.midi)).toEqual([36,48]);
    expect(result.filter(note => note.staff === "treble").map(note => note.midi)).toEqual([55,59,62]);
    expect(source).toEqual(before);
  });
  it("includes sustained notes when evaluating the next hand position", () => {
    const result = allocateNotationHands([...events([36],0,384),...events([55,59,62],96)],new Set());
    expect(result[0].staff).toBe("bass");
    expect(result.slice(1).every(note => note.staff === "treble")).toBe(true);
  });
  it("keeps explicit staff choices and is deterministic regardless of storage order", () => {
    const source = events([36,48,55,59,62]); source[2].staff = "bass";
    const explicit = new Set([source[2].key]);
    expect(allocateNotationHands(source,explicit)[2].staff).toBe("bass");
    expect(allocateNotationHands([...source].reverse(),explicit).reverse()).toEqual(allocateNotationHands(source,explicit));
  });
  it("leaves a comfortable one-hand chord intact", () => {
    expect(allocateNotationHands(events([60,64,67]),new Set()).every(note => note.staff === "treble")).toBe(true);
  });
  it("uses the same allocation in the actual sheet score without changing musical data", () => {
    const source: EditorSnapshot = {id:"piano",instrumentType:"notation",instrumentId:"gm:piano",framesPerMessure:384,totalFrames:384,fps:192,
      notes:[],chords:[{id:1,startTime:0,length:96,originalMidi:[36,48,55,59,62],currentTabs:[],ogTabs:[]}],cutPositionsWithCoords:[],optimalsByTime:{}};
    const before = structuredClone(source), assigned = scoreEvents(source);
    expect(assigned.filter(note => note.staff === "bass").map(note => note.midi)).toEqual([36,48]);
    const score = buildNotationScore(source);
    expect(score.measures[0].voices.treble[0].filter(token => !token.rest).flatMap(token => token.pitches.map(pitch => pitch.midi))).toEqual([55,59,62]);
    expect(source).toEqual(before);
  });
});
