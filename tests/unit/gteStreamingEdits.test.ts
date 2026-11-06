import { describe, expect, it } from "vitest";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";
import { applyStreamingEdits, emptyStreamingEdits, recordStreamingEdit } from "../../lib/gteStreamingEdits";
import { finalizeStreamingEdits, hasStreamingRhythmEdits, streamingRhythmReference } from "../../lib/gteStreamingImport";
import { synthesizeTimingMap, frameToSeconds } from "../../lib/gteTiming";
import { streamingTrackKey } from "../../lib/transcriptionPreviewProtocol";
import { estimateImportRhythmScale } from "../../lib/gteImportRhythm";

function fixture(): CanvasSnapshot {
  return { id: "song", secondsPerBar: 2, timingMap: synthesizeTimingMap(2, 2400), editors: [{
    id: "piano", name: "Piano", program: 0, instrumentId: "upright_piano", instrumentType: "notation", trackType: "tab", fps: 240, framesPerMessure: 480, totalFrames: 2400,
    notes: [0, 120, 240, 600, 1920].map((startTime, index) => ({ id: index + 1, startTime, length: 60, midiNum: 60 + index, tab: [0, 0], optimals: [] })),
    chords: [], cutPositionsWithCoords: [], optimalsByTime: {},
  }] };
}
const edit = (base: CanvasSnapshot, change: (lane: EditorSnapshot) => void) => {
  const lane = structuredClone(base.editors[0]); change(lane);
  return recordStreamingEdit(emptyStreamingEdits(), streamingTrackKey(lane), base.editors[0], lane);
};
const final = (base: CanvasSnapshot, edits: ReturnType<typeof emptyStreamingEdits>, extra = {}) => finalizeStreamingEdits(base, edits, ["piano"], undefined,
  { timingMap: base.timingMap, quantization: { enabled: true, subdivision: "1/16" }, ...extra });

describe("stream edits independent of incoming inference", () => {
  it("is an exact identity with no edits, including metadata and references", () => {
    const base = fixture(); expect(final(base, emptyStreamingEdits())).toBe(base);
  });
  it("preserves a pitch edit while later chunks arrive, without touching neighbouring notes", () => {
    const base = fixture(), draft = edit(base, lane => { lane.notes[0].midiNum = 72; });
    const incoming = structuredClone(base); incoming.editors[0].notes.push({ ...incoming.editors[0].notes[4], id: 99, startTime: 2040 });
    const result = applyStreamingEdits(incoming, draft);
    expect(result.editors[0].notes[0].midiNum).toBe(72);
    expect(result.editors[0].notes.slice(1)).toEqual(incoming.editors[0].notes.slice(1));
    expect(incoming.editors[0].notes[0].midiNum).toBe(60);
  });
  it("keeps deletions deleted, additions once, and repeated editing idempotent", () => {
    const base = fixture(), draft = edit(base, lane => { lane.notes.splice(1, 1); lane.notes.push({ ...lane.notes[0], id: 100, midiNum: 80, startTime: 300 }); });
    const once = applyStreamingEdits(base, draft), twice = applyStreamingEdits(base, draft);
    expect(once).toEqual(twice); expect(once.editors[0].notes.some(note => note.id === 2)).toBe(false);
    expect(once.editors[0].notes.filter(note => note.midiNum === 80)).toHaveLength(1);
  });
  it("updates one journal entry across repeated changes and removes a fully undone edit", () => {
    const base = fixture(), one = structuredClone(base.editors[0]); one.notes[0].midiNum = 70;
    const first = recordStreamingEdit(emptyStreamingEdits(), "gm:0", base.editors[0], one);
    const two = structuredClone(one); two.notes[0].midiNum = 75;
    const second = recordStreamingEdit(first, "gm:0", one, two);
    expect(second.tracks[0].events).toHaveLength(1);
    const undone = recordStreamingEdit(second, "gm:0", two, base.editors[0]); expect(undone).toEqual(emptyStreamingEdits());
  });
  it("matches final notes after quantization and backend ID reassignment", () => {
    const preview = fixture(); preview.editors[0].notes[0].startTime = 3;
    const draft = edit(preview, lane => { lane.notes[0].midiNum = 78; });
    const canonical = fixture(); canonical.editors[0].notes.forEach(note => { note.id += 1000; });
    const result = final(canonical, draft);
    expect(result.editors[0].notes[0].midiNum).toBe(78);
    expect(result.editors[0].notes.slice(1)).toEqual(canonical.editors[0].notes.slice(1));
  });
  it("quantizes edited timing only at completion and preserves all other final data", () => {
    const base = fixture(), draft = edit(base, lane => { lane.notes[0].startTime = 39; lane.notes[0].length = 104; });
    expect(applyStreamingEdits(base, draft).editors[0].notes[0].startTime).toBe(39);
    const result = final(base, draft);
    expect(result.editors[0].notes[0].startTime).toBe(30);
    expect(result.editors[0].notes[0].length).toBe(120);
    expect(result.editors[0].notes.slice(1)).toEqual(base.editors[0].notes.slice(1));
  });
  it("resolves both sides before swapping two equal pitches", () => {
    const base = fixture(); base.editors[0].notes[1].midiNum = 60;
    const draft = edit(base, lane => { lane.notes[0].startTime = 120; lane.notes[1].startTime = 0; });
    const result = final(base, draft);
    expect(result.editors[0].notes.find(note => note.id === 1)?.startTime).toBe(120);
    expect(result.editors[0].notes.find(note => note.id === 2)?.startTime).toBe(0);
  });
  it("preserves unedited fields when a provisional fingering differs from the canonical one", () => {
    const preview = fixture(); preview.editors[0].notes[0].tab = [1, 5];
    const draft = edit(preview, lane => { lane.notes[0].vibrato = true; });
    const canonical = fixture(); canonical.editors[0].notes[0].tab = [2, 9];
    const result = final(canonical, draft);
    expect(result.editors[0].notes[0]).toEqual({ ...canonical.editors[0].notes[0], vibrato: true });
  });
  it("can edit a note that final quantization grouped into a chord without removing the other tone", () => {
    const preview = fixture(); preview.editors[0].notes = [preview.editors[0].notes[0]];
    const draft = edit(preview, lane => { lane.notes[0].midiNum = 72; });
    const canonical = fixture(); canonical.editors[0].notes = []; canonical.editors[0].chords = [{ id: 10, startTime: 0, length: 60, originalMidi: [60, 64], currentTabs: [[1, 1], [0, 0]], ogTabs: [[1, 1], [0, 0]] }];
    const result = final(canonical, draft).editors[0];
    expect(result.notes[0].midiNum).toBe(72);
    expect(result.chords[0].originalMidi).toEqual([64]); expect(result.chords[0].currentTabs).toEqual([[0, 0]]);
  });
  it("uses edited content for preferred rhythm, without changing fingerings elsewhere when BPM changes", () => {
    const base = fixture(), draft = edit(base, lane => { lane.notes.forEach(note => { note.length = 30; }); });
    const reference = streamingRhythmReference(base, draft, ["piano"], undefined, { timingMap: base.timingMap, quantization: { enabled: true } });
    expect(hasStreamingRhythmEdits(draft)).toBe(true);
    expect(estimateImportRhythmScale(reference)).toBe(2);
    const result = final(base, draft, { streamingRhythmScale: 2 });
    expect(result.secondsPerBar).toBe(1);
    expect(frameToSeconds(result.timingMap!, result.editors[0].notes[4].startTime)).toBe(frameToSeconds(base.timingMap!, base.editors[0].notes[4].startTime));
    expect(result.editors[0].notes[4].tab).toEqual(base.editors[0].notes[4].tab);
  });
  it("preserves new canonical chord tones when a provisional chord is deleted", () => {
    const preview = fixture(); preview.editors[0].notes = [];
    preview.editors[0].chords = [{ id: -10, startTime: 0, length: 60, originalMidi: [60, 64], currentTabs: [[1, 1], [0, 0]], ogTabs: [[1, 1], [0, 0]] }];
    const draft = edit(preview, lane => { lane.chords = []; });
    const canonical = structuredClone(preview); canonical.editors[0].chords[0].id = 10;
    canonical.editors[0].chords[0].originalMidi.push(67);
    canonical.editors[0].chords[0].currentTabs.push([2, 3]); canonical.editors[0].chords[0].ogTabs.push([2, 3]);
    const result = final(canonical, draft).editors[0];
    expect(result.chords).toHaveLength(1);
    expect(result.chords[0].originalMidi).toEqual([67]);
    expect(result.chords[0].currentTabs).toEqual([[2, 3]]);
  });
  it("never changes an unrelated track or the tempo of an existing append target", () => {
    const base = fixture(), draft = edit(base, lane => { lane.notes[0].midiNum = 72; });
    const existing = { ...structuredClone(base.editors[0]), id: "existing" }; base.editors.unshift(existing);
    const result = final(base, draft, { streamingRhythmScale: 2 });
    expect(result.editors[0]).toBe(existing); expect(result.secondsPerBar).toBe(base.secondsPerBar);
  });
});
