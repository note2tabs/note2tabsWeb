import { describe, expect, it } from "vitest";
import { buildUnsettledGhosts, createPreviewBuilder, estimateOnsetDelay, streamingBarOffset } from "../../lib/gteTranscriptionPreview";
import type { TranscriptionPreviewPayload } from "../../lib/transcriptionPreviewProtocol";

const track = (starts: number[]) => ({ name: "Guitar", trackType: "tab" as const, program: 25, instrumentId: "",
  segments: starts.map(start => ({ pitch_midi: 64, start_time_s: start, end_time_s: start + .4 })) });
const payload = (starts: number[], tempoAnalysis: any, extra: Partial<TranscriptionPreviewPayload> = {}): TranscriptionPreviewPayload => ({
  version: 1, streamId: "timeline", revision: 1, processedSeconds: 30, settledSeconds: 30, durationSeconds: 30, complete: false, tempoAnalysis, tracks: [track(starts)], ...extra });

describe("preview timeline matches the backend's MIDI timing", () => {
  it("computes bar_offset exactly like muscriptor (120 bpm 4/4 = 2 s bars)", () => {
    expect(streamingBarOffset(.5, 120, 4)).toBeCloseTo(1.5);      // push music later so the downbeat lands on a bar line
    expect(streamingBarOffset(0, 120, 4)).toBe(0);
    expect(streamingBarOffset(2, 120, 4)).toBeCloseTo(0);          // already on a bar line
    expect(streamingBarOffset(2.5, 120, 4)).toBeCloseTo(1.5);
    expect(streamingBarOffset(.5, 120, null)).toBe(0);              // unknown meter: only headroom in whole beats
    expect(streamingBarOffset(0, 120, 4, .02)).toBeCloseTo(2);      // min_shift adds whole bars so notes never go negative
  });

  it("recovers a known onset delay from onsets sitting on a beat subdivision", () => {
    const onsets = Array.from({ length: 80 }, (_, index) => .5 + index * .25 + .02);
    expect(estimateOnsetDelay(onsets, 120, .5)).toBeCloseTo(.02, 2);
    expect(estimateOnsetDelay(onsets.slice(0, 30), 120, .5)).toBeNull();                  // needs enough onsets, like the backend
    expect(estimateOnsetDelay(Array.from({ length: 80 }, (_, index) => (index * 7919) % 97 / 31), 120, .5)).toBeNull(); // no grid at all
  });

  it("puts notes played on the song's downbeats exactly on bar lines, right after the tempo is known", () => {
    const build = createPreviewBuilder();
    const live = build(payload([.5, 2.5, 4.5], { bpm: 120, beatsPerBar: 4, firstDownbeat: .5 }));
    expect(build.shiftSeconds()).toBeCloseTo(1.5);
    expect(live.editors[0].notes.map(note => note.startTime).sort((a, b) => a - b)).toEqual([480, 960, 1440]);
    expect(live.editors[0].totalFrames).toBeGreaterThanOrEqual(1440);
  });

  it("without the shift the same notes would straddle bar lines", () => {
    const build = createPreviewBuilder();
    const wrong = build(payload([.5, 2.5, 4.5], { bpm: 120, beatsPerBar: 4 }));
    expect(build.shiftSeconds()).toBe(0);
    expect(wrong.editors[0].notes.map(note => note.startTime).sort((a, b) => a - b)).toEqual([120, 600, 1080]);
  });

  it("locks the alignment for the stream, so placed notes never move as more arrive", () => {
    const build = createPreviewBuilder();
    build(payload([.5, 2.5], { bpm: 120, beatsPerBar: 4, firstDownbeat: .5 }));
    const later = build(payload([.5, 2.5, 4.5], { bpm: 120, beatsPerBar: 4, firstDownbeat: .9 }, { revision: 2 }));
    expect(build.shiftSeconds()).toBeCloseTo(1.5);
    expect(later.editors[0].notes.map(note => note.startTime).sort((a, b) => a - b)).toEqual([480, 960, 1440]);
  });

  it("uses the delay the server reports, and never re-shifts the final tracks that are already aligned", () => {
    const build = createPreviewBuilder();
    build(payload([.5], { bpm: 120, beatsPerBar: 4, firstDownbeat: .5, onsetDelay: .02 }));
    // t' = t - delay + bar_offset(min_shift = delay): the downbeat offset 1.5 s, minus the 20 ms delay.
    expect(build.shiftSeconds()).toBeCloseTo(1.5 - .02);
    const done = build(payload([2], { bpm: 120, beatsPerBar: 4 }, { complete: true, revision: 3 }));
    expect(build.shiftSeconds()).toBe(0);
    expect(done.editors[0].notes.map(note => note.startTime)).toEqual([480]);
  });

  it("places unsettled draft ghosts on the same shifted timeline", () => {
    const build = createPreviewBuilder();
    const input = payload([.5], { bpm: 120, beatsPerBar: 4, firstDownbeat: .5 }, { settledSeconds: 0, processedSeconds: 2 });
    const canvas = build(input);
    const [ghost] = buildUnsettledGhosts(input, canvas, build.shiftSeconds())[canvas.editors[0].id];
    expect(ghost.start).toBe(Math.round(2 * canvas.editors[0].fps));
    expect(buildUnsettledGhosts(input, canvas)[canvas.editors[0].id][0].start).toBe(Math.round(.5 * canvas.editors[0].fps));
  });

  it("gives equal notes equal lengths once the music is aligned to the grid, and ragged ones without it", () => {
    // Steady eighth notes whose first downbeat sits 0.5 s into the audio: not on a 16th-note multiple.
    const spb = 60 * 4 / 144, eighth = spb / 8, firstDownbeat = .5;
    const lengthsFor = (tempoAnalysis: any) => {
      let seed = 7;
      const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;     // fixed "performance" noise
      const segments = Array.from({ length: 64 }, (_, index) => {
        const start = firstDownbeat + index * eighth + (rand() - .5) * .02;
        return { pitch_midi: 64, start_time_s: start, end_time_s: start + eighth * .85 + (rand() - .5) * .02 };
      });
      const canvas = createPreviewBuilder()({ ...payload([], tempoAnalysis), processedSeconds: 60, settledSeconds: 60, durationSeconds: 60, tracks: [{ ...track([]), segments }] });
      return canvas.editors[0].notes.map(note => note.length);
    };
    const aligned = lengthsFor({ bpm: 144, beatsPerBar: 4, firstDownbeat });
    expect(aligned.length).toBeGreaterThan(55);
    expect(new Set(aligned).size).toBe(1);                                                    // every note is one eighth long
    expect(new Set(lengthsFor({ bpm: 144, beatsPerBar: 4 })).size).toBeGreaterThan(1);       // the old, unaligned behaviour was ragged
  });
});
