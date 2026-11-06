import { describe, it, expect, vi } from "vitest";
import { createStreamingReveal } from "../../lib/gteStreamingReveal";
import { createLivePlaybackLookaheadScheduler } from "../../lib/gtePlaybackLookahead";
import { completeStreamingCanvas } from "../../lib/gteStreamingCompletion";
import { createPreviewBuilder, STREAMING_CHUNK_BARS } from "../../lib/gteTranscriptionPreview";
import { streamingActiveLane } from "../../lib/gteStreamingWorkspace";
import { streamingModelTempo } from "../../lib/transcriptionPreviewProtocol";
import type { CanvasSnapshot } from "../../types/gte";
const canvas = (): CanvasSnapshot => ({ id: "stream", secondsPerBar: 2, editors: [{ id: "piano", name: "Piano", program: 0, instrumentId: "upright_piano", instrumentType: "notation", fps: 240, totalFrames: 960, framesPerMessure: 480, timeSignature: 4, timeSignatureBottom: 4,
  notes: [0, 120, 240, 480].map((startTime, id) => ({ id: -id - 1, midiNum: 60 + id, startTime, length: 57, tab: [0, 0], optimals: [] })), chords: [], cutPositionsWithCoords: [], optimalsByTime: {} }] });
describe("paced, editable streaming", () => {
 it("reveals in chronological onset groups, not a full model response at once", () => {
  const source = canvas(), reveal = createStreamingReveal(), untouched = structuredClone(source);
  expect(reveal.receive(source)?.editors[0].notes).toHaveLength(0);
  expect(reveal.advance()?.editors[0].notes.map(note => note.startTime)).toEqual([0]);
  expect(reveal.advance()?.editors[0].notes.map(note => note.startTime)).toEqual([0, 120]);
  while (reveal.pending()) reveal.advance();
  expect(reveal.advance()).toEqual(source); expect(source).toEqual(untouched);
 });
 it("releases simultaneous notes across tracks together and retains already revealed music", () => {
  const source = canvas(); source.editors.push({ ...source.editors[0], id: "other" });
  const reveal = createStreamingReveal(); reveal.receive(source);
  expect(reveal.advance()?.editors.map(lane => lane.notes.length)).toEqual([1, 1]);
  const incoming = { ...source, editors: source.editors.map(lane => ({ ...lane, notes: [...lane.notes, { ...lane.notes[0], id: -100, startTime: 600 }] })) };
  expect(reveal.receive(incoming)?.editors.map(lane => lane.notes.length)).toEqual([1, 1]);
  while (reveal.pending()) reveal.advance();
  expect(reveal.advance()?.editors.map(lane => lane.notes.length)).toEqual([5, 5]);
 });
 it("uses settled one-bar chunks and reserves the song timeline", () => {
  expect(STREAMING_CHUNK_BARS).toBe(1);
  const build = createPreviewBuilder();
  const source = { version: 1 as const, streamId: "s", revision: 1, processedSeconds: 1, settledSeconds: 1, durationSeconds: 20, complete: false, tempoAnalysis: { bpm: 120 }, tracks: [{ name: "Piano", trackType: "tab" as const, program: 0, instrumentId: "", segments: [{ pitch_midi: 60, start_time_s: 0, end_time_s: .5 }] }] };
  expect(build(source).editors[0].notes).toHaveLength(0);
  const next = build({ ...source, revision: 2, settledSeconds: 4, processedSeconds: 4 });
  expect(next.editors[0].notes).toHaveLength(1); expect(next.editors[0].totalFrames).toBe(4800);
 });
 it("spreads arrivals over the expected cadence without changing the musician's track", () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  try {
   const source = canvas(), reveal = createStreamingReveal(); reveal.receive(source);
   expect(reveal.advance(1000)?.editors[0].notes).toHaveLength(0);
   expect(reveal.advance(1000)?.editors[0].notes).toHaveLength(1);
   expect(reveal.advance(4000)?.editors[0].notes).toHaveLength(3);
   expect(reveal.advance(2000)?.editors[0].notes).toHaveLength(4);
   const changed = { ...source, activeLaneId: "new", editors: [{ ...source.editors[0], id: "new" }, ...source.editors] };
   expect(streamingActiveLane("piano", changed)).toBe("piano");
   expect(streamingActiveLane(null, changed)).toBe("new");
  } finally { vi.useRealTimers(); }
 });
 it("updates a live audio queue without replaying old notes or resetting its clock", () => {
  const schedule = vi.fn();
  const event = (id: string, start: number) => ({ id, start, end: start + .3 });
  const first = event("a", 0), second = event("b", 1);
  const pump = createLivePlaybackLookaheadScheduler([first, second], schedule, .25, note => note.id, note => note.end);
  pump(0); pump.replace([first, second, event("c", 1.5)]); pump(.9); pump(1.3);
  expect(schedule.mock.calls.map(([note]) => note.id)).toEqual(["a", "b", "c"]);
  pump.replace([first, second, event("past", .2), event("future", 2)]); pump(1.9);
  expect(schedule.mock.calls.map(([note]) => note.id)).toEqual(["a", "b", "c", "future"]);
 });
 it("finishes from the edited score at MuScriptor BPM, without the preferred-eighth-note tempo policy", () => {
  const current = canvas(); current.editors[0].notes[0].midiNum = 77; current.editors[0].notes.splice(1, 1);
  current.editors[0].notes.push({ ...current.editors[0].notes[0], id: 99, midiNum: 80, startTime: 700 });
  const original = structuredClone(current);
  const result = completeStreamingCanvas(current, { bpm: 93, beatsPerBar: 4, tracks: [] });
  expect(result.secondsPerBar).toBeCloseTo(60 * 4 / 93);
  expect(result.editors[0].notes.map(note => note.midiNum)).toContain(77);
  expect(result.editors[0].notes.map(note => note.midiNum)).toContain(80);
  expect(result.editors[0].notes.map(note => note.midiNum)).not.toContain(61);
  expect(result.editors[0].notes.every(note => note.startTime % 30 === 0)).toBe(true);
  expect(current).toEqual(original);
 });
 it("reads tempo from the actual model result envelope", () => {
  expect(streamingModelTempo({ output: { result: { tempoAnalysis: { bpm: 141.78, beatsPerBar: 4 } } } })).toEqual({ bpm: 141.78, beatsPerBar: 4 });
 });
});
