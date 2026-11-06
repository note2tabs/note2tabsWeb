import { describe, it, expect } from "vitest";
import { createPreviewBuilder, quantizeStreamingSegments, buildUnsettledGhosts } from "../../lib/gteTranscriptionPreview";
import { completeStreamingCanvas } from "../../lib/gteStreamingCompletion";
import { restorePitchedImport } from "../../lib/gteNotationImport";
import { emptyStreamingEdits, recordStreamingCanvasEdit, applyStreamingEdits } from "../../lib/gteStreamingEdits";
import type { TranscriptionPreviewPayload } from "../../lib/transcriptionPreviewProtocol";

const fixture = (beats: number, bpm: number): TranscriptionPreviewPayload => {
 const bar = 60 * beats / bpm;
 return { version: 1, streamId: "parity", revision: 1, durationSeconds: bar * 7, processedSeconds: bar * 7, settledSeconds: bar * 7, complete: true,
  tempoAnalysis: { bpm, beatsPerBar: beats }, tracks: [0, 25, 33, 0].map((program, track) => ({ name: ["Piano", "Guitar", "Bass", "Drums"][track], program,
   trackType: track === 3 ? "drums" : track === 2 ? "bass" : "tab", instrumentId: "", segments: Array.from({ length: 48 }, (_, i) => ({
    sourceId: String(i), pitch_midi: track === 3 ? [36, 42, 38][i % 3] : [track === 2 ? 28 : track === 1 ? 52 : 60, track === 2 ? 35 : track === 1 ? 55 : 64][i % 2],
    start_time_s: i / 8 * bar + (i % 3 - 1) * .009 + .012, end_time_s: i / 8 * bar + bar / 8 + .009,
   })) })) };
};
describe("continuous quantization and optimization parity", () => {
 it("turns the actual seven-pitch guitar onset into one playable simplified chord", () => {
  const raw = fixture(4, 144);
  raw.tracks = [{ name: "Guitar", program: 29, trackType: "tab", instrumentId: "electric_overdrive", segments: [41,48,53,55,60,64,67].map((pitch_midi, i) => ({ sourceId: String(i), pitch_midi, start_time_s: 1, end_time_s: 1.2 })) }];
  const original = structuredClone(raw);
  const lane = createPreviewBuilder()(raw).editors[0];
  expect(lane.chords).toHaveLength(1);
  expect(lane.chords[0].currentTabs).toHaveLength(6);
  expect(new Set(lane.chords[0].currentTabs.map(tab => tab[0])).size).toBe(6);
  expect(lane.notes).toHaveLength(0);
  expect(raw).toEqual(original);
 });
 it.each([[4,120], [3,93], [4,71.5], [4,176]])("matches processing all raw input at once (%s/%s)", (beats, bpm) => {
  const raw = fixture(beats, bpm), untouched = structuredClone(raw), bar = 60 * beats / bpm;
  const reference = createPreviewBuilder()(raw), progressive = createPreviewBuilder();
  let current = reference;
  for (const bars of [1, 2, 2, 4, 5, 7]) {
   const through = bars * bar;
   current = progressive({ ...raw, revision: bars, complete: bars === 7, settledSeconds: through, processedSeconds: through,
    tracks: raw.tracks.map(track => ({ ...track, segments: track.segments.filter(note => note.end_time_s! <= through) })) });
  }
  expect(current).toEqual(reference);
  expect(completeStreamingCanvas(current, { tracks: raw.tracks, bpm: bpm * 2 })).toEqual(reference);
  expect(raw).toEqual(untouched);
  // Independent whole-track quantizer reference, rather than comparing two
  // copies of the chunk implementation, for pitches and timing on notation.
  const lane = reference.editors[0];
  const whole = restorePitchedImport({ ...lane, notes: [], chords: [] }, raw.tracks[0].segments, reference.timingMap, { enabled: true, subdivision: "1/16" });
  const events = (notes: typeof lane.notes) => notes.map(note => [note.midiNum, note.startTime, note.length]).sort((a,b) => a[1]-b[1] || a[0]-b[0]);
  expect(events(lane.notes)).toEqual(events(whole.notes));
 });
 it("keeps preprocessing tempo and user edits when later chunks and completion arrive", () => {
  const raw = fixture(4,120), build = createPreviewBuilder();
  const first = build({ ...raw, complete: false, processedSeconds: 5, settledSeconds: 5, tracks: raw.tracks.map(track => ({ ...track, segments: track.segments.filter(note => note.end_time_s! <= 5) })) });
  const edited = structuredClone(first); edited.editors[0].notes[0].midiNum = 81; edited.editors[0].notes[0].startTime += 7;
  edited.editors[0].notes.splice(1,1);
  const journal = recordStreamingCanvasEdit(emptyStreamingEdits(), first, edited);
  const final = build({ ...raw, revision: 2, tempoAnalysis: { bpm: 240, beatsPerBar: 3 } });
  const expected = applyStreamingEdits(createPreviewBuilder()(raw), journal);
  const actual = completeStreamingCanvas(applyStreamingEdits(final,journal), { tracks: raw.tracks, bpm:240 });
  expect(actual).toEqual(expected);
  expect(actual.secondsPerBar).toBe(2);
  expect(actual.editors[0].notes.some(note => note.midiNum === 81 && note.startTime === 7)).toBe(true);
 });
 it("quantizes boundary clusters with both neighbouring bars in view", () => {
  const source = fixture(4,120).tracks[0];
  source.segments = [{ sourceId:"a", pitch_midi:60, start_time_s:1.988, end_time_s:2.25 }, { sourceId:"b", pitch_midi:64, start_time_s:2.012, end_time_s:2.25 }];
  expect(quantizeStreamingSegments(source,2,4).map(note => note.start_time_s)).toEqual([2,2]);
 });
 it("releases a boundary once its lookahead settles, even within the same bar", () => {
  const raw = fixture(4,120), build = createPreviewBuilder();
  const early = build({ ...raw, complete:false, settledSeconds:2, processedSeconds:2 });
  expect(early.editors[0].notes).toHaveLength(0);
  const ready = build({ ...raw, revision:2, complete:false, settledSeconds:2.1, processedSeconds:2.1 });
  expect(ready.editors[0].notes.length).toBeGreaterThan(0);
 });
 it("does not expose notes at an invented tempo while preprocessing is unavailable", () => {
  expect(() => createPreviewBuilder()({ ...fixture(4,120), tempoAnalysis:null })).toThrow("Waiting for preprocessing tempo");
 });
});

it("keeps early predictions display-only until the same canonical bar path settles",()=>{
 const raw=fixture(4,120), build=createPreviewBuilder(), early={...raw,complete:false,settledSeconds:0,processedSeconds:1};
 const score=build(early), original=structuredClone(early), ghosts=buildUnsettledGhosts(early,score);
 expect(score.editors.every(lane=>!lane.notes.length&&!lane.chords.length)).toBe(true);
 expect(Object.values(ghosts).flat().length).toBeGreaterThan(0);
 expect(Object.values(ghosts).flat().every(note=>note.phase==="preview")).toBe(true);
 expect(early).toEqual(original);
 expect(build(raw)).toEqual(createPreviewBuilder()(raw));
 expect(buildUnsettledGhosts(raw,build(raw))).toEqual({});
});
