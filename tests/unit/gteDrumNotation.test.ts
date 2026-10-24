import { beforeAll, expect, it } from "vitest";
import { CanvasContext, Element, Stem } from "vexflow/bravura";
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { buildDrumNotationScore } from "../../lib/gteDrumNotation";
import { buildDrumNote } from "../../lib/gteDrums";
import { prepareNotationEngraving } from "../../lib/gteNotationEngraving";
import type { EditorSnapshot } from "../../types/gte";

beforeAll(() => {
  for (const [file, family] of [["bravura", "Bravura"], ["academico", "Academico"]]) {
    const font = readFileSync(`node_modules/vexflow/build/esm/src/fonts/${file}.js`, "utf8");
    expect(GlobalFonts.register(Buffer.from(font.match(/base64,([^']+)/)![1], "base64"), family)).toBeTruthy();
  }
  Element.setTextMeasurementCanvas(createCanvas(400, 100) as unknown as HTMLCanvasElement);
});

it("engraves a single percussion staff with cymbal heads, independent kick voice and original timing", () => {
  const snapshot: EditorSnapshot = { id: "drums", editorType: "drums", fps: 240,
    framesPerMessure: 480, totalFrames: 480, timeSignature: 4, timeSignatureBottom: 4,
    notes: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((voiceIndex, index) => buildDrumNote({ id: index, voiceIndex, startTime: index * 30, length: 30 })),
    chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
  const before = structuredClone(snapshot);
  const score = buildDrumNotationScore(snapshot);
  expect(score.percussion).toBe(true);
  const tokens = score.measures.flatMap(m => m.voices.treble.flat()).filter(t => !t.rest);
  expect(tokens.flatMap(t => t.pitches).some(p => p.key.endsWith("/cx"))).toBe(true);
  expect(tokens.some(t => t.voice === 1)).toBe(true);
  const engraved = prepareNotationEngraving(score, 900);
  expect(engraved.built.every(m => m.records.every(r => r.token.staff === "treble"))).toBe(true);
  const canvas = createCanvas(engraved.layout.width, engraved.layout.height);
  expect(() => engraved.draw(new CanvasContext(canvas.getContext("2d") as unknown as CanvasRenderingContext2D))).not.toThrow();
  expect(snapshot).toEqual(before);
  const looped = buildDrumNotationScore({ ...snapshot, totalFrames: 960,
    notes: [buildDrumNote({ id: 1, voiceIndex: 8, startTime: 0, length: 60 })],
    drumLoops: [{ id: "repeat", sourceStart: 0, sourceEnd: 240, loopEnd: 960 }] });
  const attacks = new Set(looped.measures.flatMap(m => m.voices.treble.flat()).flatMap(t => t.sources.map(s => s.start)));
  expect([...attacks].sort((a, b) => a - b)).toEqual([0, 240, 480, 720]);
});

const kit = (notes: EditorSnapshot["notes"], extra: Partial<EditorSnapshot> = {}): EditorSnapshot => ({ id: "kit", editorType: "drums", fps: 240,
  framesPerMessure: 480, totalFrames: 480, timeSignature: 4, timeSignatureBottom: 4,
  notes, chords: [], cutPositionsWithCoords: [], optimalsByTime: {}, ...extra });
const hit = (id: number, voiceIndex: number, startTime: number, length = 1) => buildDrumNote({ id, voiceIndex, startTime, length });

it("engraves a Canvas eighth-note rock pattern without micro-rests, regardless of sample length", () => {
  const source = kit([
    ...Array.from({ length: 8 }, (_, index) => hit(index, 2, index * 60)),
    hit(8, 6, 120), hit(9, 6, 360), hit(10, 8, 0), hit(11, 8, 240),
  ]);
  const before = structuredClone(source), score = buildDrumNotationScore(source);
  const [hands, feet] = score.measures[0].voices.treble;
  expect(hands).toHaveLength(8);
  expect(hands.every(token => !token.rest && token.denominator === 8)).toBe(true);
  expect(hands.filter(token => token.pitches.length === 2)).toHaveLength(2);
  expect(feet.map(token => [token.rest, token.denominator])).toEqual([[false, 4], [true, 4], [false, 4], [true, 4]]);
  const represented = hands.concat(feet).flatMap(token => token.sources);
  expect(new Set(represented.map(event => event.key)).size).toBe(source.notes.length);
  expect(represented.map(event => event.start).sort((a,b) => a-b)).toEqual(source.notes.map(note => note.startTime).sort((a,b) => a-b));
  const changedLengths = buildDrumNotationScore({ ...source, notes: source.notes.map((note, index) => ({ ...note, length: index % 2 ? 300 : 7 })) });
  const rhythm = (model: typeof score) => model.measures.flatMap(m => m.voices.treble.flat()).map(token => [token.tick, token.ticks, token.denominator, token.rest]);
  expect(rhythm(changedLengths)).toEqual(rhythm(score));
  const engraved = prepareNotationEngraving(score, 900);
  expect(engraved.layout.beamCount).toBe(4);
  for (const record of engraved.built[0].records.filter(record => !record.token.rest)) expect(record.note.getStemDirection()).toBe(record.token.voice === 0 ? Stem.UP : Stem.DOWN);
  const image = createCanvas(engraved.layout.width, engraved.layout.height), context = image.getContext("2d");
  context.fillStyle = "white"; context.fillRect(0, 0, image.width, image.height);
  engraved.draw(new CanvasContext(context as unknown as CanvasRenderingContext2D));
  if (process.env.GTE_DRUM_RENDER_PATH) writeFileSync(process.env.GTE_DRUM_RENDER_PATH, image.toBuffer("image/png"));
  expect(source).toEqual(before);
});

it("quantizes onset jitter without moving playback events", () => {
  const source = kit([hit(0, 2, 1), hit(1, 2, 59), hit(2, 6, 60), hit(3, 2, 121)]);
  const before = structuredClone(source), score = buildDrumNotationScore(source);
  const sounding = score.measures[0].voices.treble[0].filter(token => !token.rest);
  expect(sounding.map(token => token.tick)).toEqual([0, 48, 96]);
  expect(sounding[1].sources).toHaveLength(2);
  expect(sounding.flatMap(token => token.sources).map(event => event.start).sort((a,b) => a-b)).toEqual([1, 59, 60, 121]);
  expect(source).toEqual(before);
});

it("recognizes onset triplets without making an accompanying quarter-note kick a tuplet", () => {
  const score = buildDrumNotationScore(kit([hit(0, 2, 0), hit(1, 2, 40), hit(2, 2, 80), hit(3, 8, 0)]));
  const [hands, feet] = score.measures[0].voices.treble;
  expect(hands.filter(token => !token.rest).map(token => token.ticks)).toEqual([32, 32, 32]);
  expect(feet.find(token => !token.rest)?.denominator).toBe(4);
  expect(feet.every(token => !token.tuplet)).toBe(true);
  expect(prepareNotationEngraving(score, 900).layout.tupletCount).toBe(1);
});

it("keeps compound-meter eighths grouped in dotted beats, and preserves real thirty-second patterns", () => {
  const sixteenths = buildDrumNotationScore(kit(Array.from({ length: 16 }, (_, i) => hit(i, 2, i * 30))));
  expect(sixteenths.measures[0].voices.treble[0].every(token => !token.rest && token.denominator === 16)).toBe(true);
  expect(prepareNotationEngraving(sixteenths, 900).layout.beamCount).toBe(4);
  const compound = buildDrumNotationScore(kit(Array.from({ length: 6 }, (_, i) => hit(i, 2, i * 80)), { timeSignature: 6, timeSignatureBottom: 8 }));
  expect(compound.measures[0].voices.treble[0].every(token => !token.rest && token.denominator === 8)).toBe(true);
  expect(prepareNotationEngraving(compound, 900).layout.beamCount).toBe(2);
  const fine = buildDrumNotationScore(kit(Array.from({ length: 8 }, (_, i) => hit(i, 2, i * 15))));
  const notes = fine.measures[0].voices.treble[0].filter(token => !token.rest);
  expect(notes).toHaveLength(8);
  expect(notes.every(token => token.denominator === 32)).toBe(true);
});
