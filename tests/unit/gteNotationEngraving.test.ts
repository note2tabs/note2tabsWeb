import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { CanvasContext, Element, Renderer, Stem } from "vexflow/bravura";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { buildNotationScore } from "../../lib/gteNotationScore";
import { engravingPoint, engravingXAt, prepareNotationEngraving } from "../../lib/gteNotationEngraving";
import type { EditorSnapshot, Note } from "../../types/gte";
import { assignVoices } from "../../lib/gteAssignVoices";
import { setScoreVoice } from "../../lib/gteNotation";

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
  it("flips every stem and beam when bulk-changing the only voice on both staves", () => {
    const input = source([...[76,77,79,81].map((pitch, i) => ({ ...note(i + 1, i * 60, 60, pitch), notationStaff: "treble" as const })),
      ...[40,41,43,45].map((pitch, i) => ({ ...note(i + 5, i * 60, 60, pitch), notationStaff: "bass" as const }))], { totalFrames: 480 });
    const before = structuredClone(input), selection = { noteIds: input.notes.map(note => note.id), chordIds: [] };
    let track = input;
    for (const voice of [1,2,1] as const) {
      track = setScoreVoice(track, selection, voice);
      const prepared = prepareNotationEngraving(buildNotationScore(track), 1000);
      const canvas = createCanvas(prepared.layout.width, prepared.layout.height);
      prepared.draw(new CanvasContext(canvas.getContext("2d") as unknown as CanvasRenderingContext2D));
      const records = prepared.built.flatMap(measure => measure.records).filter(record => !record.token.rest);
      expect(records).toHaveLength(8);
      for (const record of records) expect(record.note.getStemDirection()).toBe(voice === 1 ? Stem.UP : Stem.DOWN);
      expect(prepared.layout.beamCount).toBeGreaterThan(0);
      for (const measure of prepared.built) for (const beam of measure.beams) expect(beam.getNotes().every(note => note.getStemDirection() === (voice === 1 ? Stem.UP : Stem.DOWN))).toBe(true);
      expect(track.notes.map(note => [note.id,note.midiNum,note.startTime,note.length])).toEqual(before.notes.map(note => [note.id,note.midiNum,note.startTime,note.length]));
    }
    expect(input).toEqual(before);
  });
  it("engraves automatic independent voices with complete rhythms and correct stems", () => {
    const input = source([note(1, 0, 480, 64), ...[76,77,79,81].map((pitch, i) => note(i + 2, i * 120, 120, pitch))], { totalFrames: 480 });
    input.notes.forEach(note => { note.notationStaff = "treble"; });
    const assigned = assignVoices({ track: input }).track;
    const prepared = prepareNotationEngraving(buildNotationScore(assigned), 1000);
    for (const voice of prepared.built[0].voices) expect(voice.isComplete()).toBe(true);
    for (const record of prepared.built[0].records.filter(record => !record.token.rest)) expect(record.note.getStemDirection()).toBe(record.token.voice === 0 ? Stem.UP : Stem.DOWN);
    const canvas = createCanvas(prepared.layout.width, prepared.layout.height), context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    prepared.draw(new CanvasContext(context as unknown as CanvasRenderingContext2D));
    if (process.env.GTE_NOTATION_RENDER_DIR) { mkdirSync(process.env.GTE_NOTATION_RENDER_DIR, { recursive: true }); writeFileSync(process.env.GTE_NOTATION_RENDER_DIR + "/auto-voices.png", canvas.toBuffer("image/png")); }
  });
  it.each([1, 2] as const)("uses the assigned Voice %i direction even without provenance or a second voice", voice => {
    const notes = Array.from({ length: 4 }, (_, index) => ({ ...note(index, index * 60, 60, voice === 1 ? 84 : 40), notationVoice: voice }));
    const snapshot = source(notes, { totalFrames: 480 });
    const before = structuredClone(snapshot);
    const prepared = prepareNotationEngraving(buildNotationScore(snapshot), 900);
    for (const record of prepared.built.flatMap(measure => measure.records).filter(record => !record.token.rest)) {
      expect(record.note.getStemDirection()).toBe(voice === 1 ? Stem.UP : Stem.DOWN);
    }
    expect(snapshot).toEqual(before);
  });
  it("renders manual voices, explicit ties, cross-bar sustains and phrasing slurs", () => {
    const snapshot = source([note(1, 0, 120, 76), note(2, 120, 120, 76),
      { ...note(3, 0, 240, 64), notationVoice: 2 }, note(4, 420, 180, 79)], {
      notation: { ties: [{ from: "n:1", to: "n:2" }], slurs: [{ from: "n:1", to: "n:4" }],
        rests: [{ id: 1, start: 240, length: 90, voice: 2, staff: "treble", denominator: 8, dotted: true }] },
    });
    const prepared = prepareNotationEngraving(buildNotationScore(snapshot), 900);
    for (const { token, note: rendered } of prepared.built[0].records.filter(({ token }) => !token.rest && token.staff === "treble")) {
      expect(rendered.getStemDirection()).toBe(token.voice === 0 ? Stem.UP : Stem.DOWN);
    }
    const canvas = createCanvas(prepared.layout.width, prepared.layout.height);
    const context = canvas.getContext("2d"); context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    prepared.draw(new CanvasContext(context as unknown as CanvasRenderingContext2D));
    expect(prepared.layout.tieCount).toBeGreaterThanOrEqual(2);
    if (process.env.GTE_NOTATION_RENDER_DIR) {
      mkdirSync(process.env.GTE_NOTATION_RENDER_DIR, { recursive: true });
      writeFileSync(process.env.GTE_NOTATION_RENDER_DIR + "/manual-voices-ties-slurs.png", canvas.toBuffer("image/png"));
    }
  });
  it("automatically wraps and justifies systems according to notation density", () => {
    const sparse = buildNotationScore(source([], { totalFrames: 480 * 16 }));
    const wide = prepareNotationEngraving(sparse, 1000).layout;
    const narrow = prepareNotationEngraving(sparse, 500).layout;
    const firstSystem = wide.measures.filter((measure) => measure.top === wide.measures[0].top);
    expect(firstSystem.length).toBeGreaterThan(4);
    expect(narrow.measures.filter((measure) => measure.top === narrow.measures[0].top).length).toBeLessThan(firstSystem.length);
    const last = firstSystem[firstSystem.length - 1];
    expect(last.x + last.width).toBeCloseTo(984);
    const dense = buildNotationScore(source(Array.from({ length: 64 }, (_, index) => note(index, index * 30, 30, 72 + index % 5))));
    const denseLayout = prepareNotationEngraving(dense, 1000).layout;
    expect(denseLayout.measures.filter((measure) => measure.top === denseLayout.measures[0].top).length).toBeLessThan(firstSystem.length);
  });
  it("compresses an oversized bar to its row without dropping notes or changing musical timing", () => {
    const snapshot = source(Array.from({ length: 64 }, (_, index) => note(index + 1, index * 7.5, 7.5, 60 + index % 12)), { totalFrames: 960 });
    const before = structuredClone(snapshot), score = buildNotationScore(snapshot);
    const prepared = prepareNotationEngraving(score, 600);
    expect(prepared.layout.width).toBeLessThanOrEqual(600);
    expect(prepared.layout.measures[0].x + prepared.layout.measures[0].width).toBeLessThanOrEqual(584.001);
    expect(new Set(prepared.layout.hits.flatMap(hit => hit.token.sources.map(event => event.key))).size).toBe(64);
    for (const hit of prepared.layout.hits) for (const head of hit.heads) expect(head.x).toBeLessThanOrEqual(600);
    const frame = 240, position = engravingXAt(prepared.layout, score, frame)!;
    expect(engravingPoint(prepared.layout, score, position.x, position.measure.staffBottom.treble, 7.5)?.frame).toBe(frame);
    const canvas = createCanvas(prepared.layout.width, prepared.layout.height);
    prepared.draw(new CanvasContext(canvas.getContext("2d") as unknown as CanvasRenderingContext2D));
    expect(snapshot).toEqual(before);
    if (process.env.GTE_NOTATION_RENDER_DIR) { mkdirSync(process.env.GTE_NOTATION_RENDER_DIR, { recursive: true }); writeFileSync(process.env.GTE_NOTATION_RENDER_DIR + "/compressed-dense-bar.png", canvas.toBuffer("image/png")); }
  });
  it("compresses actual SVG glyph groups, not the root viewBox, for oversized bars", () => {
    const score = buildNotationScore(source(Array.from({ length: 64 }, (_, index) => note(index + 1, index * 7.5, 7.5, 60 + index % 12)), { totalFrames: 960 }));
    const prepared = prepareNotationEngraving(score, 600), host = document.createElement("div");
    document.body.append(host);
    try {
      const renderer = new Renderer(host, Renderer.Backends.SVG);
      renderer.resize(prepared.layout.width, prepared.layout.height);
      const svg = host.querySelector("svg")!, before = svg.getAttribute("viewBox");
      prepared.draw(renderer.getContext());
      expect(svg.getAttribute("viewBox")).toBe(before);
      const groups = [...svg.querySelectorAll('[data-notation-density]')];
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        const scale = Number(group.getAttribute("data-notation-density"));
        expect(scale).toBeGreaterThan(0); expect(scale).toBeLessThan(1);
        expect(group.getAttribute("transform")).toBe(`scale(${scale} 1)`);
        expect(group.children.length).toBeGreaterThan(0);
      }
      expect(svg.querySelectorAll('.vf-stavenote').length).toBeGreaterThan(0);
      const normalHeads = [...svg.querySelectorAll('.vf-notation-notehead-size')];
      expect(normalHeads.length).toBeGreaterThan(0);
      for (const head of normalHeads) {
        const parent = head.closest('[data-notation-density]')!;
        const compression = Number(parent.getAttribute('data-notation-density'));
        const expansion = Number(head.getAttribute('transform')!.match(/scale\(([^ ]+) 1\)/)![1]);
        expect(compression * expansion).toBeCloseTo(1, 10);
        expect(head.querySelector('.vf-notehead')).not.toBeNull();
      }
      expect(prepared.layout.hits.every(hit => hit.scaleX === 1)).toBe(true);
    } finally { host.remove(); }
  });
  it("keeps braces inside the canvas and separates rests from other voices' noteheads", () => {
    const score = buildNotationScore(source([
      note(1, 0, 240, 76), note(2, 0, 60, 71), note(3, 60, 60, 72),
      note(4, 120, 60, 74), note(5, 300, 30, 76), note(6, 330, 30, 79),
    ]));
    const prepared = prepareNotationEngraving(score, 640, 4);
    expect(prepared.layout.measures[0].x).toBeGreaterThanOrEqual(40);
    for (const measure of prepared.built) {
      for (const { token, note: rest } of measure.records) {
        if (!token.rest || token.hidden) continue;
        const box = rest.getBoundingBox();
        for (const hit of prepared.layout.hits.filter((hit) => hit.token.staff === token.staff)) {
          for (const head of hit.heads) {
            const overlaps = box.getX() < head.x + 16 && box.getX() + box.getW() > head.x - 3 &&
              box.getY() < head.y + 7 && box.getY() + box.getH() > head.y - 7;
            expect(overlaps).toBe(false);
          }
        }
      }
    }
    const canvas = createCanvas(prepared.layout.width, prepared.layout.height);
    canvas.getContext("2d").fillStyle = "white";
    canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height);
    prepared.draw(new CanvasContext(canvas.getContext("2d") as unknown as CanvasRenderingContext2D));
    if (process.env.GTE_NOTATION_RENDER_DIR) {
      mkdirSync(process.env.GTE_NOTATION_RENDER_DIR, { recursive: true });
      writeFileSync(process.env.GTE_NOTATION_RENDER_DIR + "/rest-clearance.png", canvas.toBuffer("image/png"));
    }
  });
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
