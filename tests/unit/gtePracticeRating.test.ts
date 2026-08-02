import { describe, expect, it } from "vitest";
import {
  buildPracticeRatingBars,
  encodeMonoWav,
  normalizePracticeRatingReplay,
  trimPracticeRecordingSamples,
} from "../../lib/gtePracticeRating";
import type { EditorSnapshot } from "../../types/gte";

const snapshot: EditorSnapshot = {
  id: "lane-1",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 960,
  notes: [
    { id: 7, startTime: 480, length: 120, midiNum: 64, tab: [0, 0], optimals: [] },
  ],
  chords: [
    {
      id: 3,
      startTime: 720,
      length: 120,
      originalMidi: [67],
      currentTabs: [[1, 3]],
      ogTabs: [[1, 3]],
    },
  ],
  cutPositionsWithCoords: [],
  optimalsByTime: {},
};

describe("practice rating helpers", () => {
  it("builds speed-adjusted bar events with stable placement keys", () => {
    const result = buildPracticeRatingBars({
      snapshot,
      range: { startFrame: 480, endFrame: 960 },
      framesPerBar: 480,
      fps: 240,
      playbackSpeed: 0.5,
      recordingLeadSeconds: 0.25,
    });

    expect(result.bars).toHaveLength(1);
    expect(result.bars[0].note_events[0]).toMatchObject({
      source_index: 0,
      start_time_s: 0.25,
      end_time_s: 1.25,
      pitch_midi: 64,
    });
    expect(result.eventMap[0].placementKey).toBe("note-7");
    expect(result.eventMap[1].placementKey).toBe("chord-3-0");
  });

  it("does not request or display a perfect score for rest-only bars", () => {
    const built = buildPracticeRatingBars({
      snapshot,
      range: { startFrame: 0, endFrame: 960 },
      framesPerBar: 480,
      fps: 240,
      playbackSpeed: 1,
      recordingLeadSeconds: 0,
    });

    expect(built.bars.map((bar) => bar.bar_index)).toEqual([1]);

    const replay = normalizePracticeRatingReplay({
      laneId: "lane-1",
      startFrame: 0,
      endFrame: 960,
      playbackSpeed: 1,
      fps: 240,
      recordingLeadSeconds: 0,
      framesPerBar: 480,
      eventMap: {},
      responseBars: [{ bar_index: 0, notes: [], false_notes: [] }],
    });

    expect(replay.bars).toEqual([]);
  });

  it("classifies matched, timing, missed, and unexpected notes", () => {
    const replay = normalizePracticeRatingReplay({
      laneId: "lane-1",
      startFrame: 480,
      endFrame: 960,
      playbackSpeed: 1,
      fps: 240,
      recordingLeadSeconds: 0.25,
      framesPerBar: 480,
      eventMap: {
        0: { placementKey: "note-7", frame: 480, barIndex: 1, pitchMidi: 64 },
        1: { placementKey: "chord-3-0", frame: 720, barIndex: 1, pitchMidi: 67 },
        2: { placementKey: "note-9", frame: 840, barIndex: 1, pitchMidi: 69 },
      },
      responseBars: [
        {
          bar_index: 1,
          notes: [
            { event_index: 0, status: "matched", timing_accuracy: 95, length_accuracy: 0 },
            { event_index: 1, status: "matched", timing_accuracy: 80, length_accuracy: 95 },
            { event_index: 2, status: "missed", timing_accuracy: 0, length_accuracy: 0 },
          ],
          false_notes: [{ start_time_s: 1.25, pitch_midi: 71, confidence: 0.8 }],
        },
      ],
    });

    expect(replay.notes.map((note) => note.status)).toEqual(["correct", "timing", "missed"]);
    expect(replay.falseNotes[0]).toMatchObject({ frame: 720, barIndex: 1, pitchMidi: 71 });
    expect(replay.bars[0]).toMatchObject({
      score: 44,
      correct: 1,
      timing: 1,
      missed: 1,
      falseNotes: 1,
    });
  });

  it("encodes browser samples as 16-bit mono WAV", async () => {
    const blob = encodeMonoWav(new Float32Array([-1, 0, 1]), 44_100);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(44_100);
    expect(blob.size).toBe(50);
  });

  it("does not award half credit to a pitch match with zero timing accuracy", () => {
    const replay = normalizePracticeRatingReplay({
      laneId: "lane-1",
      startFrame: 480,
      endFrame: 960,
      playbackSpeed: 1,
      fps: 240,
      recordingLeadSeconds: 0,
      framesPerBar: 480,
      eventMap: {
        0: { placementKey: "note-7", frame: 480, barIndex: 1, pitchMidi: 64 },
      },
      responseBars: [
        {
          bar_index: 1,
          notes: [{ event_index: 0, status: "matched", timing_accuracy: 0 }],
          false_notes: [],
        },
      ],
    });

    expect(replay.notes[0].status).toBe("timing");
    expect(replay.bars[0].score).toBe(0);
  });

  it("trims recording setup time and the trailing capture from replay audio", () => {
    const samples = Float32Array.from({ length: 20 }, (_, index) => index);
    const replaySamples = trimPracticeRecordingSamples(samples, 10, 0.5, 1);

    expect(Array.from(replaySamples)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
});
