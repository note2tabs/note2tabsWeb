import { describe, expect, it } from "vitest";
import { buildNotationScore, notationKey, notationPitch } from "../../lib/gteNotationScore";
import type { EditorSnapshot, Note } from "../../types/gte";
const note = (id: number, startTime: number, length: number, midiNum = 72): Note => ({ id, startTime, length, midiNum, tab: [0, 0], optimals: [] });
const source = (notes: Note[], extra: Partial<EditorSnapshot> = {}): EditorSnapshot => ({
  id: "score", instrumentId: "gm:piano", timeSignature: 4, timeSignatureBottom: 4, framesPerMessure: 480, fps: 240,
  totalFrames: 480, notes, chords: [], cutPositionsWithCoords: [], optimalsByTime: {}, ...extra,
});
describe("notation rhythmic model", () => {
  it("does not create a tiny tied tail or extra measure for floating-point bar overruns", () => {
    const input = source([note(1, 360, 120.00001)], { totalFrames: 480.00001 });
    const score = buildNotationScore(input);
    expect(score.measures).toHaveLength(1);
    const notes = score.measures[0].voices.treble.flat().filter((token) => !token.rest);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ ticks: 96, denominator: 4, tieOut: false });
    expect(input.notes[0].length).toBe(120.00001);
  });
  it("does not mutate continuous performance data while building complete quantized voices", () => {
    const input = source([note(1, 0.6, 119.7), note(2, 121.3, 117.9, 74)]);
    const before = structuredClone(input), score = buildNotationScore(input);
    expect(input).toEqual(before);
    for (const measure of score.measures) for (const voices of Object.values(measure.voices)) for (const voice of voices) {
      expect(voice.reduce((sum, token) => sum + token.ticks, 0)).toBe(score.barTicks);
      expect(voice.every((token) => token.ticks > 0)).toBe(true);
    }
  });
  it("groups equal-onset equal-duration pitches into one chord, not independent stems", () => {
    const score = buildNotationScore(source([note(1, 0, 120, 60), note(2, 0, 120, 64), note(3, 0, 120, 67)]));
    const voices = score.measures[0].voices.treble;
    expect(voices).toHaveLength(2);
    expect(voices[1].every((token) => token.rest)).toBe(true);
    expect(voices[0][0].pitches.map((pitch) => pitch.midi)).toEqual([60, 64, 67]);
  });
  it("honors manual voice assignments rather than allocating by pitch or overlap", () => {
    const score = buildNotationScore(source([{ ...note(1, 0, 240, 60), notationVoice: 2 }, note(2, 0, 120, 76), note(3, 120, 120, 74), note(4, 360, 120, 72)]));
    const voices = score.measures[0].voices.treble;
    expect(voices).toHaveLength(2);
    expect(voices[0].filter((token) => !token.rest).map((token) => token.pitches[0].midi)).toEqual([76, 74, 72]);
    expect(voices[1].filter((token) => !token.rest).map((token) => token.pitches[0].midi)).toEqual([60]);
    expect(voices[0].some((token) => token.rest && token.tick === 192)).toBe(true);
  });
  it("keeps legacy overlaps in voice one and preserves all source releases", () => {
    const input = source([note(1, 0, 240, 60), note(2, 0, 60, 76), note(3, 60, 60, 74)]);
    const score = buildNotationScore(input);
    expect(score.measures[0].voices.treble[1].every((token) => token.rest)).toBe(true);
    const held = score.measures[0].voices.treble[0].filter((token) => token.sources.some((event) => event.noteId === 1));
    expect(held.reduce((sum, token) => sum + token.ticks, 0)).toBe(192);
    expect(input.notes[0].length).toBe(240);
  });
  it("groups eighth-note beams by simple and compound meter", () => {
    const score = buildNotationScore(source(Array.from({ length: 4 }, (_, index) => note(index, index * 60, 60))));
    const tokens = score.measures[0].voices.treble[0].filter((token) => !token.rest);
    expect(tokens[0].beamGroup).toBe(tokens[1].beamGroup);
    expect(tokens[1].beamGroup).not.toBe(tokens[2].beamGroup);
    const compound = buildNotationScore(source(Array.from({ length: 6 }, (_, index) => note(index, index * 80, 80)), { timeSignature: 6, timeSignatureBottom: 8 }));
    expect(compound.groups).toEqual([3, 3]);
    const eighths = compound.measures[0].voices.treble[0].filter((token) => !token.rest);
    expect(eighths[0].beamGroup).toBe(eighths[2].beamGroup);
    expect(eighths[2].beamGroup).not.toBe(eighths[3].beamGroup);
  });
  it("keeps conventional dots and ties across bar and strong rhythmic boundaries", () => {
    const dotted = buildNotationScore(source([note(1, 0, 180)]));
    expect(dotted.measures[0].voices.treble[0][0]).toMatchObject({ denominator: 4, dotted: true, ticks: 144 });
    const tied = buildNotationScore(source([note(1, 420, 180)]));
    const tokens = tied.measures.flatMap((measure) => measure.voices.treble[0]).filter((token) => !token.rest);
    expect(tokens[0].tieOut).toBe(true);
    expect(tokens[1].tieIn).toBe(true);
    expect(tokens.reduce((sum, token) => sum + token.ticks, 0)).toBe(144);
  });
  it("recognizes three eighth-note triplets instead of drawing arbitrary binary tails", () => {
    const score = buildNotationScore(source([note(1, 0, 40), note(2, 40, 40, 74), note(3, 80, 40, 76)]));
    const notes = score.measures[0].voices.treble[0].filter((token) => !token.rest);
    expect(notes).toHaveLength(3);
    expect(notes.map((token) => token.ticks)).toEqual([32, 32, 32]);
    expect(notes.every((token) => token.denominator === 8 && token.tuplet === notes[0].tuplet)).toBe(true);
    expect(notes[0].tuplet).toBeTruthy();
  });
  it("connects E minor and flat keys to actual engraved key signatures and spelling", () => {
    expect(notationPitch(65, "F#").key).toBe("e#/4");
    expect(notationPitch(59, "Cb").key).toBe("cb/4");
    expect(notationKey(4, 1)).toBe("Em");
    const minor = buildNotationScore(source([note(1, 0, 120, 66)]), { keyBase: 4, keyType: 1 });
    expect(minor.key).toBe("Em");
    expect(minor.measures[0].voices.treble[0][0].pitches[0].key).toBe("f#/4");
    const flats = buildNotationScore(source([note(1, 0, 120, 70)]), { keyBase: 10 });
    expect(flats.measures[0].voices.treble[0][0].pitches[0].key).toBe("bb/4");
  });
});
