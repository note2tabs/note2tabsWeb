import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { CanvasContext, Element } from "vexflow/bravura";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { buildNotationScore } from "../../lib/gteNotationScore";
import { engravingPoint, engravingXAt, prepareNotationEngraving } from "../../lib/gteNotationEngraving";
import type { EditorSnapshot, Note } from "../../types/gte";

let dom: JSDOM;
beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("document", dom.window.document);
  for (const [file, family] of [["bravura", "Bravura"], ["academico", "Academico"]]) {
    const font = readFileSync("node_modules/vexflow/build/esm/src/fonts/" + file + ".js", "utf8");
    const data = font.match(/base64,([^']+)/)![1];
    expect(GlobalFonts.register(Buffer.from(data, "base64"), family)).toBeTruthy();
  }
  Element.setTextMeasurementCanvas(createCanvas(400, 100) as unknown as HTMLCanvasElement);
});
afterAll(() => { dom.window.close(); vi.unstubAllGlobals(); });
const note = (id: number, startTime: number, length: number, midiNum = 72): Note => ({ id, startTime, length, midiNum, tab: [0, 0], optimals: [] });
const source = (notes: Note[], extra: Partial<EditorSnapshot> = {}): EditorSnapshot => ({ id: "score", instrumentId: "gm:piano",
  framesPerMessure: 480, totalFrames: 1920, timeSignature: 4, timeSignatureBottom: 4, fps: 240, notes, chords: [], cutPositionsWithCoords: [], optimalsByTime: {}, ...extra });

describe("real-font notation engraving", () => {
  it.each([[3, 4], [6, 8], [7, 8], [5, 4]])("fills independent voices in %i/%i", (numerator, denominator) => {
    const input = source([note(1, 0, 240, 60), note(2, 0, 60, 76), note(3, 60, 60, 74), note(4, 120, 120, 72)],
      { timeSignature: numerator, timeSignatureBottom: denominator });
    const score = buildNotationScore(input);
    const prepared = prepareNotationEngraving(score, 1000, 4);
    for (const measure of prepared.built) for (const voice of measure.voices) expect(voice.isComplete()).toBe(true);
  });
  it("maps insertion to engraved positions, respects snapping and excludes clefs and outside space", () => {
    const score = buildNotationScore(source([note(1, 0, 120, 66)]), { keyBase: 4, keyType: 1 });
    const { layout } = prepareNotationEngraving(score, 1000, 4);
    const position = engravingXAt(layout, score, 47)!;
    const y = position.measure.staffBottom.treble - 5;
    expect(engravingPoint(layout, score, position.x, y, 60, false)).toMatchObject({ frame: 47, midi: 66 });
    expect(engravingPoint(layout, score, position.x, y, 60, true)?.frame).toBe(60);
    expect(engravingPoint(layout, score, position.measure.x + 1, y, 60)).toBeNull();
    expect(engravingPoint(layout, score, position.x, -100, 60)).toBeNull();
    const last = engravingPoint(layout, score, position.measure.endX - 1, y, 60)!;
    expect(last.frame).toBe(420);
  });
  it("gives dense music more room, draws beams and aligns simultaneous staves", () => {
    const input = source([
      ...Array.from({ length: 16 }, (_, i) => note(i + 1, i * 30, 30, 66 + i % 6)),
      { ...note(30, 0, 240, 48), notationStaff: "bass" },
    ]);
    const score = buildNotationScore(input, { keyBase: 4, keyType: 1 });
    const prepared = prepareNotationEngraving(score, 1200, 4);
    const canvas = createCanvas(prepared.layout.width, prepared.layout.height);
    canvas.getContext("2d").fillStyle = "white"; canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height);
    expect(() => prepared.draw(new CanvasContext(canvas.getContext("2d") as unknown as CanvasRenderingContext2D))).not.toThrow();
    expect(prepared.layout.beamCount).toBeGreaterThan(0);
    expect(prepared.layout.measures[0].width).toBeGreaterThan(prepared.layout.measures[1].width * 1.5);
    const simultaneous = prepared.layout.hits.filter((hit) => hit.token.tick === 0);
    expect(Math.max(...simultaneous.map((hit) => hit.x)) - Math.min(...simultaneous.map((hit) => hit.x))).toBeLessThan(1);
    expect(prepared.layout.measures[1].width).toBeLessThan(200);
    const melody = prepared.layout.hits.filter((hit) => hit.token.staff === "treble");
    for (let index = 1; index < melody.length; index++) {
      // Noteheads at successive onsets must never occupy the same horizontal space.
      expect(melody[index].heads[0].x - melody[index - 1].heads[0].x).toBeGreaterThan(12);
    }
    for (const voice of prepared.built[0].voices) expect(voice.isComplete()).toBe(true);
    if (process.env.GTE_NOTATION_RENDER_DIR) {
      mkdirSync(process.env.GTE_NOTATION_RENDER_DIR, { recursive: true });
      writeFileSync(process.env.GTE_NOTATION_RENDER_DIR + "/dense-score.png", canvas.toBuffer("image/png"));
    }
  });
  it("renders genuine triplets and ties, and inverts the engraved time mapping for editing", () => {
    const score = buildNotationScore(source([note(1, 0, 40), note(2, 40, 40, 74), note(3, 80, 40, 76), note(4, 420, 180, 67)]));
    const prepared = prepareNotationEngraving(score, 1000, 4);
    const canvas = createCanvas(prepared.layout.width, prepared.layout.height);
    canvas.getContext("2d").fillStyle = "white"; canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height);
    prepared.draw(new CanvasContext(canvas.getContext("2d") as unknown as CanvasRenderingContext2D));
    expect(prepared.layout.tupletCount).toBeGreaterThan(0);
    expect(prepared.layout.tieCount).toBeGreaterThan(0);
    const position = engravingXAt(prepared.layout, score, 120)!;
    const point = engravingPoint(prepared.layout, score, position.x, position.measure.staffBottom.treble, 120)!;
    expect(point.frame).toBe(120);
    expect(point.midi).toBe(64);
    if (process.env.GTE_NOTATION_RENDER_DIR) writeFileSync(process.env.GTE_NOTATION_RENDER_DIR + "/triplets-ties.png", canvas.toBuffer("image/png"));
  });
  it("engraves polyphony, adjacent chord tones, dots and accidental cancellation with real metrics", () => {
    const input = source([
      note(1, 0, 240, 60), note(2, 0, 60, 76), note(3, 60, 60, 74), note(4, 120, 120, 72),
      note(5, 240, 180, 61), note(6, 240, 180, 62), note(7, 240, 180, 65),
      note(8, 480, 120, 66), note(9, 600, 120, 65), note(10, 960, 120, 66),
    ]);
    const prepared = prepareNotationEngraving(buildNotationScore(input, { keyBase: 4, keyType: 1 }), 1100, 4);
    const canvas = createCanvas(prepared.layout.width, prepared.layout.height);
    const context = canvas.getContext("2d"); context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    prepared.draw(new CanvasContext(context as unknown as CanvasRenderingContext2D));
    const chord = prepared.layout.hits.find((hit) => hit.token.pitches.length === 3)!;
    expect(new Set(chord.heads.map((head) => head.x)).size).toBeGreaterThan(1);
    const quarterRecords = prepared.built.flatMap((measure) => measure.records).filter((record) => record.token.sources.some((source) => [8, 9, 10].includes(source.noteId!)));
    const accidentals = quarterRecords.map((record) => record.note.getModifiers().filter((modifier) => modifier.getCategory() === "Accidental").map((modifier: any) => modifier.type));
    expect(accidentals).toEqual([[], ["n"], []]);
    if (process.env.GTE_NOTATION_RENDER_DIR) writeFileSync(process.env.GTE_NOTATION_RENDER_DIR + "/polyphony-accidentals.png", canvas.toBuffer("image/png"));
  });
});
