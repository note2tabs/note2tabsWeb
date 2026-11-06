import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewBuilder } from "../../lib/gteTranscriptionPreview";
import { previewMetadata, type TranscriptionPreviewPayload } from "../../lib/transcriptionPreviewProtocol";
import { detectImportedKey } from "../../lib/gteImportedKey";
import { optimizeImportedTrackFingerings } from "../../lib/gteApi";

const payload = (): TranscriptionPreviewPayload => ({ version: 1, streamId: "attempt-1", revision: 1,
  processedSeconds: 4, settledSeconds: 4, durationSeconds: 20, complete: false, tempoAnalysis: { bpm: 120 },
  tracks: [{ name: "Piano", trackType: "tab", instrumentId: "", program: 0, segments: [
    { start_time_s: .013, end_time_s: .269, pitch_midi: 60 },
    { start_time_s: .513, end_time_s: .769, pitch_midi: 64 },
  ] }] });

describe("disposable streaming transcription", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("finalizes afresh from complete raw notes and saves the final key", async () => {
    const raw = payload();
    const preview = createPreviewBuilder()(raw);
    const completed = structuredClone(raw.tracks);
    completed[0].segments.push({ start_time_s: 1, end_time_s: 2, pitch_midi: 67 });
    const finalCanvas = structuredClone(preview);
    finalCanvas.editors[0].notes = [];
    let saved: any;
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      saved = JSON.parse(init.body).snapshot;
      return new Response(JSON.stringify({ ok: true, canvas: saved }));
    }));
    const result = await optimizeImportedTrackFingerings("final", finalCanvas, 1, [finalCanvas.editors[0].id], completed,
      { timingMap: finalCanvas.timingMap, quantization: { enabled: true, subdivision: "1/16" } });
    expect(result.editors[0].notes.map(note => note.midiNum)).toEqual([60, 64, 67]);
    expect(preview.editors[0].notes).toHaveLength(2);
    expect(saved.keyBase).toBe(detectImportedKey(completed)?.keyBase);
    expect(saved.keyType).toBe(detectImportedKey(completed)?.keyType);
  });
  it("validates status metadata without including storage credentials", () => {
    expect(previewMetadata({ ...payload(), artifact: { secret: "private" } })).not.toHaveProperty("artifact");
    expect(previewMetadata({ ...payload(), processedSeconds: NaN })).toBeNull();
    expect(previewMetadata({ ...payload(), revision: -1 })).toBeNull();
  });
  it("quantizes before revealing, preserves raw input and maps GM instruments", () => {
    const raw = payload(), original = structuredClone(raw), canvas = createPreviewBuilder()(raw);
    expect(raw).toEqual(original);
    expect(canvas.editors[0].instrumentType).toBe("notation");
    expect(canvas.editors[0].instrumentId).toBe("upright_piano");
    expect(canvas.editors[0].notes.map(note => note.startTime)).toEqual([0, 120]);
    expect(canvas.editors[0].notes.map(note => note.midiNum)).toEqual([60, 64]);
    expect(canvas.editors[0].notes.every(note => note.velocity === 100 / 127)).toBe(true);
  });
  it("reuses unchanged tracks and rebuilds changed tracks from raw rather than the previous preview", () => {
    const build = createPreviewBuilder(), raw = payload(), first = build(raw);
    expect(build({ ...raw, revision: 2 }).editors[0]).toBe(first.editors[0]);
    const next = structuredClone(raw); next.revision = 3; next.tracks[0].segments[0].end_time_s = 1.5;
    const second = build(next);
    expect(second.editors[0]).not.toBe(first.editors[0]);
    expect(second.editors[0].notes.length).toBe(2);
    expect(first.editors[0].notes[0].length).toBeLessThan(second.editors[0].notes[0].length);
    expect(build({ ...raw, streamId: "attempt-2" }).editors[0].id).not.toBe(first.editors[0].id);
  });
  it("keeps bass and drum identities distinct and optimizes guitar chord fingerings", () => {
    const raw = payload(); raw.complete = true;
    raw.tracks = [{ ...raw.tracks[0], name: "Guitar", program: 25, segments: [40, 47, 52].map(pitch_midi => ({ start_time_s: 0, end_time_s: .5, pitch_midi })) },
      { name: "Bass", trackType: "bass", instrumentId: "", program: 33, segments: [{ start_time_s: 0, end_time_s: .5, pitch_midi: 28 }] },
      { name: "Drums", trackType: "drums", instrumentId: "", program: 0, segments: [{ start_time_s: 0, end_time_s: .1, pitch_midi: 36 }] }];
    const canvas = createPreviewBuilder()(raw);
    expect(canvas.editors.map(lane => lane.instrumentType)).toEqual(["guitar-tab", "bass-tab", "drums"]);
    expect(canvas.editors[0].chords).toHaveLength(1);
    expect(canvas.editors[0].chords[0].originalMidi).toHaveLength(3);
    expect(canvas.editors[0].chords[0].currentTabs.length).toBeGreaterThan(0);
    expect(canvas.editors[1].notes[0].tab[0]).toBeLessThan(4);
    expect(canvas.editors[2].notes[0].midiNum).toBe(36);
  });
  it("rejects invalid notes before optimization", () => {
    const raw = payload(); raw.tracks[0].segments[0].pitch_midi = NaN;
    expect(() => createPreviewBuilder()(raw)).toThrow("Invalid preview notes");
  });
  it("detects major and minor from duration profiles, ignoring percussion", () => {
    const source = payload().tracks[0];
    const track = (pitches: number[], lengths: number[]) => ({ ...source, segments: pitches.map((pitch_midi, index) => ({ pitch_midi, start_time_s: index * 4, end_time_s: index * 4 + lengths[index] })) });
    expect(detectImportedKey([track([60, 64, 67, 65, 62, 71], [6, 4, 5, 2, 2, 1])])?.label).toBe("C Major");
    expect(detectImportedKey([track([57, 60, 64, 59, 62, 65, 68], [8, 4, 5, 1, 2, 2, 1])])?.label).toBe("A Minor");
    expect(detectImportedKey([{ ...source, trackType: "drums" }])).toBeNull();
  });
});
