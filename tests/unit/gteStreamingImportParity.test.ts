import { afterEach, describe, expect, it, vi } from "vitest";
import { gteApi, type TranscriberTrack } from "../../lib/gteApi";
import { createPreviewBuilder } from "../../lib/gteTranscriptionPreview";
import { emptyStreamingEdits } from "../../lib/gteStreamingEdits";
import { synthesizeTimingMap } from "../../lib/gteTiming";
import { restorePitchedImport } from "../../lib/gteNotationImport";
import { importedInstrument } from "../../lib/gteImportedInstrument";
import { getAllTabsForMidi, getTuningPreset } from "../../lib/gteTuning";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";

function fixture(numerator: number, bpm: number) {
  const duration = 60 * numerator / bpm, map = synthesizeTimingMap(duration, 12 * 480, numerator);
  const tracks: TranscriberTrack[] = [0, 25, 33, 0].map((program, track) => ({ program, name: ["Piano", "Guitar", "Bass", "Drums"][track],
    trackType: track === 3 ? "drums" : track === 2 ? "bass" : "tab", instrumentId: "", segments: Array.from({ length: 32 }, (_, index) => ({
      pitch_midi: track === 3 ? [36, 42, 38, 42][index % 4] : (track === 2 ? 28 : track === 1 ? 52 : 60) + [0, 4, 7, 2][index % 4],
      start_time_s: index * duration / 8 + .009 * (index % 3), end_time_s: index * duration / 8 + (track === 3 ? .025 : duration / (index % 5 === 0 ? 4 : 8)),
    })) }));
  const canvas: CanvasSnapshot = { id: "canvas", keyBase: 2, name: "Song", timingMap: map, secondsPerBar: duration, editors: tracks.map((track, index) => {
    const seed: EditorSnapshot = { id: `lane-${index}`, ...importedInstrument(track), trackType: track.trackType, name: track.name, program: track.program,
      tuning: track.trackType === "bass" ? { openStringMidi: getTuningPreset("bass-standard").openStringMidi } : undefined,
      timeSignature: numerator, timeSignatureBottom: 4, framesPerMessure: 480, fps: 480 / duration, totalFrames: 12 * 480, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
    const lane = restorePitchedImport(seed, track.segments, map, { enabled: true, subdivision: "1/16" });
    lane.notes.forEach(note => { note.optimals = getAllTabsForMidi(lane, note.midiNum); note.tab = note.optimals[0] ?? [0, 0]; });
    return lane;
  }) };
  return { canvas, tracks, duration };
}

afterEach(() => vi.unstubAllGlobals());
describe("streaming/non-streaming final-import parity", () => {
  it.each([[4, 120], [3, 93], [4, 71.5], [4, 176]])("preserves the complete ordinary import byte-for-byte (%s beats, %s BPM), regardless of partial previews", async (beats, bpm) => {
    const { canvas, tracks, duration } = fixture(beats, bpm), raw = structuredClone(tracks);
    let imports: unknown[] = [], snapshots: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (String(url).endsWith("/transcriber/import")) {
        imports.push(body);
        return new Response(JSON.stringify({ ok: true, editorId: "canvas", target: "new", importedEditorIds: canvas.editors.map(lane => lane.id), canvas: structuredClone(canvas) }));
      }
      if (body.snapshot) { snapshots.push(body.snapshot); return new Response(JSON.stringify({ ok: true, canvas: body.snapshot })); }
      if (body.timingMap) return new Response(JSON.stringify({ ok: true, canvas: { ...structuredClone(canvas), timingMap: body.timingMap }, timingMap: body.timingMap }));
      throw new Error(`Unexpected import request ${url}`);
    }));
    const payload = { target: "new" as const, name: "Song", tracks, segmentGroups: tracks.map(track => track.segments), quantize: true, importGroupId: "same-input" };
    const ordinary = await gteApi.importTranscriberToSaved(payload);
    const ordinaryImports = structuredClone(imports), ordinarySnapshots = structuredClone(snapshots);
    imports = []; snapshots = [];
    const build = createPreviewBuilder();
    // Overlapping revisions, a duplicate revision and the final remainder must
    // never become inputs to final import or accumulate quantization error.
    for (const bars of [1, 4, 4, 7, 12]) build({ version: 1, streamId: "attempt", revision: bars, processedSeconds: bars * duration,
      settledSeconds: bars * duration, durationSeconds: 12 * duration, complete: bars === 12, tempoAnalysis: { bpm, beatsPerBar: beats },
      tracks: tracks.map(track => ({ ...track, segments: track.segments.filter(note => note.start_time_s! < bars * duration) })) });
    const streamed = await gteApi.importTranscriberToSaved({ ...payload, streamingEdits: emptyStreamingEdits() });
    expect(tracks).toEqual(raw);
    expect(imports).toEqual(ordinaryImports);
    expect(snapshots).toEqual(ordinarySnapshots);
    expect(streamed.canvas).toEqual(ordinary.canvas);
  });
});
