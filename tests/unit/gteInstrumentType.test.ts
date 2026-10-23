import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import type { EditorSnapshot } from "../../types/gte";
import { getTrackInstrumentType } from "../../lib/gteInstrumentType";
import { convertTrackInstrument } from "../../lib/gteInstrumentConversion";
import { getTrackInstrumentOption } from "../../lib/gteInstrumentManifest";
import { restoreNotationSnapshot, serializeNotationPayload } from "../../lib/gteNotationPersistence";
import { importedInstrument } from "../../lib/gteImportedInstrument";
import { restorePitchedImport, pitchedImportTransport } from "../../lib/gteNotationImport";
import { optimizeImportedTrackFingerings } from "../../lib/gteApi";
import { scoreEvents } from "../../lib/gteNotation";
import { synthesizeTimingMap } from "../../lib/gteTiming";

const track = (midis = [60, 64, 67]): EditorSnapshot => ({ id: "piano", instrumentType: "notation", instrumentId: "upright_piano", editorType: "tab",
  framesPerMessure: 480, fps: 240, totalFrames: 480, cutPositionsWithCoords: [], optimalsByTime: {}, chords: [],
  notes: midis.map((midiNum, index) => ({ id: index + 1, midiNum, startTime: 0, length: 120, tab: [0, 0], optimals: [] })) });

describe("independent track type and sound", () => {
  it("routes by explicit format regardless of chosen sound, with legacy fallback", () => {
    expect(getTrackInstrumentType({ ...track(), instrumentId: "acoustic" })).toBe("notation");
    expect(getTrackInstrumentType({ ...track(), instrumentType: "guitar-tab", instrumentId: "upright_piano" })).toBe("guitar-tab");
    expect(getTrackInstrumentType({ instrumentId: "upright_piano" })).toBe("notation");
    expect(getTrackInstrumentType({ editorType: "drums", instrumentType: "notation" })).toBe("drums");
  });
  it("registers only existing piano samples at correct concert pitches", () => {
    const piano = getTrackInstrumentOption("upright_piano");
    expect(piano.kind).toBe("opus");
    expect(piano.samples.find(sample => sample.midi === 60)?.url).toContain("c4_");
    expect(piano.samples.find(sample => sample.midi === 21)?.url).toContain("a0_");
    expect(piano.samples.every(sample => existsSync("public" + sample.url))).toBe(true);
  });
  it("converts playable notation without changing timing, pitch or the source", () => {
    const source = track(), before = structuredClone(source);
    const result = convertTrackInstrument(source, "guitar-tab").snapshot!;
    expect(source).toEqual(before);
    expect(result.instrumentId).toBe("acoustic");
    expect(new Set(result.notes.map(note => note.tab[0])).size).toBe(3);
    expect(scoreEvents(result).map(({ midi, start, length }) => ({ midi, start, length }))).toEqual(scoreEvents(source).map(({ midi, start, length }) => ({ midi, start, length })));
  });
  it("detects out-of-range and same-string/polyphony issues without dropping notes", () => {
    expect(convertTrackInstrument(track([10]), "guitar-tab")).toMatchObject({ issue: expect.stringContaining("outside") });
    expect(convertTrackInstrument(track([86, 86]), "guitar-tab")).toMatchObject({ issue: expect.stringContaining("overlapping") });
    expect(convertTrackInstrument(track([60, 61, 62, 63, 64, 65, 66]), "guitar-tab").snapshot).toBeUndefined();
  });
  it("forces conversion to tab with a warning instead of cancelling", () => {
    const outside = convertTrackInstrument(track([10]), "guitar-tab", { force: true });
    expect(outside.snapshot).toBeDefined(); expect(outside.warning).toContain("outside");
    expect(outside.snapshot!.notes.every(note => note.tab[0] >= 0)).toBe(true);
    const dense = convertTrackInstrument(track([60, 61, 62, 63, 64, 65, 66]), "guitar-tab", { force: true });
    expect(dense.snapshot).toBeDefined(); expect(dense.warning).toBeTruthy();
    const notes = dense.snapshot!.notes;
    expect(notes.some((a, i) => notes.some((b, j) => i < j && a.tab[0] === b.tab[0] && a.startTime < b.startTime + b.length && b.startTime < a.startTime + a.length))).toBe(false);
  });
  it("blocks bass-to-guitar and all drum conversions", () => {
    expect(convertTrackInstrument({ ...track(), instrumentType: "bass-tab" }, "guitar-tab").snapshot).toBeUndefined();
    expect(convertTrackInstrument(track(), "drums").snapshot).toBeUndefined();
    expect(convertTrackInstrument({ ...track(), editorType: "drums" }, "notation").snapshot).toBeUndefined();
  });
  it("preserves chord tones when converting to bass's independent-note model", () => {
    const source = track([]);
    source.chords = [{ id: 4, startTime: 60, length: 120, originalMidi: [28, 33], currentTabs: [[0,0], [0,0]], ogTabs: [] }];
    const converted = convertTrackInstrument(source, "bass-tab").snapshot!;
    expect(converted.chords).toEqual([]);
    expect(converted.notes.map(note => note.midiNum)).toEqual([28, 33]);
    expect(converted.notes.every(note => note.startTime === 60 && note.length === 120)).toBe(true);
  });
  it("survives legacy backend field stripping and pitch restamping", () => {
    const source = track([21, 108]);
    source.chords = [{ id: 8, startTime: 120, length: 60, originalMidi: [36, 96], currentTabs: [[0,0], [0,0]], ogTabs: [] }];
    const wire = serializeNotationPayload(source) as EditorSnapshot;
    expect(wire.instrumentId).toBe("gm:piano");
    delete wire.instrumentType; delete wire.notation;
    wire.notes = wire.notes.map(note => ({ ...note, midiNum: 64 }));
    wire.chords = wire.chords.map(chord => ({ ...chord, originalMidi: [64, 64] }));
    const restored = restoreNotationSnapshot(wire);
    expect(restored.instrumentId).toBe("upright_piano");
    expect(restored.notes.map(note => note.midiNum)).toEqual([21,108]);
    expect(restored.chords[0].originalMidi).toEqual([36,96]);
  });
  it("retains any sound on bass without changing its format", () => {
    const source = { ...track(), instrumentType: "bass-tab" as const, editorType: "bass", instrumentId: "upright_piano" };
    const wire = serializeNotationPayload(source) as EditorSnapshot;
    delete wire.instrumentType; wire.instrumentId = "bass_overdrive";
    expect(restoreNotationSnapshot(wire)).toMatchObject({ instrumentType: "bass-tab", instrumentId: "upright_piano" });
  });
  it.each([[0,"notation","upright_piano"], [24,"guitar-tab","acoustic"], [33,"bass-tab","bass_overdrive"], [42,"notation","gm:strings"], [81,"notation","gm:synth-lead"], [90,"notation","gm:synth-pad"], [73,"notation","gm:instrument"], [4,"notation","gm:instrument"], [3,"notation","upright_piano"]])("maps GM program %s to an appropriate representation and sound", (program, instrumentType, instrumentId) => {
    expect(importedInstrument({ program })).toEqual({ instrumentType, instrumentId });
  });
  it("does not let an old default guitar sound misclassify imported piano", () => {
    expect(importedInstrument({ program: 0, instrumentId: "jazz" })).toEqual({ instrumentType: "notation", instrumentId: "upright_piano" });
    expect(importedInstrument({ program: 33, instrumentId: "jazz" })).toEqual({ instrumentType: "bass-tab", instrumentId: "bass_overdrive" });
    expect(importedInstrument({ program: 71, name: "Bass clarinet" }).instrumentType).toBe("notation");
    expect(importedInstrument({ name: "Violin", instrumentId: "violin" })).toEqual({ instrumentType: "notation", instrumentId: "gm:strings" });
  });
  it("reconstructs low and high notation imports using aligned timing, retaining velocity and bend", () => {
    const source = track([]), map = synthesizeTimingMap(2, 960, 4, 4);
    const result = restorePitchedImport(source, [{ start_time_s: .125, end_time_s: .375, pitch_midi: 21, amplitude: .4, pitch_bend: [0, 20] }], map);
    expect(result.notes[0]).toMatchObject({ startTime: 30, length: 60, midiNum: 21, velocity: .4, pitchBend: [0,20] });
    expect(source.notes).toHaveLength(0);
    const offset = restorePitchedImport({ ...source, timelineOffsetFrames: 480 }, [{ start_time_s: .125, end_time_s: .375, pitch_midi: 108 }], map);
    expect(offset.notes[0]).toMatchObject({ startTime: 510, length: 60, midiNum: 108 });
  });
  it("quantizes notation imports to the chosen subdivision, strength and optional durations", () => {
    const source = track([]), map = synthesizeTimingMap(2, 960, 4, 4), seg = [{ start_time_s: .2, end_time_s: .375, pitch_midi: 60 }];
    expect(restorePitchedImport(source, seg, map).notes[0]).toMatchObject({ startTime: 48, length: 42 });
    expect(restorePitchedImport(source, seg, map, { enabled: true, subdivision: "1/16", strength: 1 }).notes[0]).toMatchObject({ startTime: 60, length: 30 });
    expect(restorePitchedImport(source, seg, map, { enabled: true, subdivision: "1/16", strength: .5 }).notes[0].startTime).toBe(54);
    expect(restorePitchedImport(source, seg, map, { enabled: true, subdivision: "1/16", strength: 1, quantizeDurations: true }).notes[0]).toMatchObject({ startTime: 60, length: 30 });
  });
  it("keeps original import events immutable while passing legacy-server-compatible pitched transport", () => {
    const segments = [{ start_time_s: 0, end_time_s: .5, pitch_midi: 21 }, { start_time_s: .5, end_time_s: 1, pitch_midi: 108 }];
    const payload = { tracks: [{ name: "Piano", trackType: "tab" as const, program: 0, instrumentId: "upright_piano", segments }], segmentGroups: [segments] };
    const before = structuredClone(payload), wire = pitchedImportTransport(payload);
    expect(payload).toEqual(before);
    expect(wire.tracks[0]).toMatchObject({ instrumentId: "gm:piano", name: "Notation" });
    expect(wire.segmentGroups[0].map(event => event.pitch_midi)).toEqual([40,86]);
    expect(wire.tracks[0].segments).toEqual(wire.segmentGroups[0]);
  });
  it("persists original piano events, not transport pitches or optimized guitar fingerings", async () => {
    const map = synthesizeTimingMap(2, 480, 4, 4), source = track([40,86]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await optimizeImportedTrackFingerings("project", { id: "project", timingMap: map, editors: [source] }, 2, [source.id], [{
        name: "Piano", trackType: "tab", instrumentId: "upright_piano", program: 0,
        segments: [{ start_time_s: 0, end_time_s: .5, pitch_midi: 21 }, { start_time_s: .5, end_time_s: 1, pitch_midi: 108 }],
      }]);
      expect(result.editors[0]).toMatchObject({ instrumentType: "notation", instrumentId: "upright_piano", name: "Piano" });
      expect(result.editors[0].notes.map(note => note.midiNum)).toEqual([21,108]);
      expect(result.editors[0].chords).toEqual([]);
      const wire = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).snapshot.editors[0];
      expect(wire.chordEditor.notation.assignments["n:1"].midi).toBe(21);
      expect(wire.chordEditor.notation.assignments["n:2"].midi).toBe(108);
      expect(source.notes.map(note => note.midiNum)).toEqual([40,86]);
    } finally { vi.unstubAllGlobals(); }
  });
});
