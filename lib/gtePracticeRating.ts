import type { EditorSnapshot } from "../types/gte";
import type { PracticeLoopRange } from "./gtePractice";
import { normalizePlaybackSpeed } from "./gtePractice";
import { getOpenStringMidiFromSnapshot } from "./gteTuning";

export type PracticeRatingStatus = "correct" | "timing" | "missed";

export type PracticeRatingNote = {
  eventIndex: number;
  placementKey: string;
  frame: number;
  barIndex: number;
  pitchMidi: number;
  status: PracticeRatingStatus;
  timingAccuracy: number;
  onsetErrorMs: number | null;
};

export type PracticeRatingFalseNote = {
  frame: number;
  barIndex: number;
  pitchMidi: number;
  confidence: number;
};

export type PracticeRatingBar = {
  barIndex: number;
  score: number;
  correct: number;
  timing: number;
  missed: number;
  falseNotes: number;
};

export type PracticeRatingReplay = {
  id: string;
  createdAt: string;
  laneId: string;
  startFrame: number;
  endFrame: number;
  playbackSpeed: number;
  audioStorageKey?: string;
  audioDurationSeconds?: number;
  notes: PracticeRatingNote[];
  falseNotes: PracticeRatingFalseNote[];
  bars: PracticeRatingBar[];
};

export function trimPracticeRecordingSamples(
  samples: Float32Array,
  sampleRate: number,
  recordingLeadSeconds: number,
  playbackDurationSeconds: number
) {
  const safeSampleRate = Math.max(1, Math.round(safeNumber(sampleRate, 1)));
  const start = Math.max(
    0,
    Math.min(samples.length, Math.round(Math.max(0, safeNumber(recordingLeadSeconds)) * safeSampleRate))
  );
  const requestedLength = Math.max(
    0,
    Math.round(Math.max(0, safeNumber(playbackDurationSeconds)) * safeSampleRate)
  );
  const end = Math.max(start, Math.min(samples.length, start + requestedLength));
  return samples.slice(start, end);
}

export type PracticeRatingExpectedEvent = {
  source_index: number;
  start_time_s: number;
  end_time_s: number;
  pitch_midi: number;
  amplitude: number;
  pitch_bend: null;
};

export type PracticeRatingRequestBar = {
  bar_index: number;
  start_time_s: number;
  duration_s: number;
  note_events: PracticeRatingExpectedEvent[];
};

export type PracticeRatingEventMap = Record<
  number,
  { placementKey: string; frame: number; barIndex: number; pitchMidi: number }
>;

const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveTabMidi = (
  snapshot: EditorSnapshot,
  tab: [number, number],
  fallback?: number
) => {
  const fromRef = snapshot.tabRef?.[tab[0]]?.[tab[1]];
  if (Number.isFinite(Number(fromRef))) return Number(fromRef);
  const openMidi = getOpenStringMidiFromSnapshot(snapshot)[tab[0]];
  if (Number.isFinite(openMidi)) return openMidi + tab[1];
  return safeNumber(fallback, 0);
};

export function buildPracticeRatingBars(input: {
  snapshot: EditorSnapshot;
  range: PracticeLoopRange;
  framesPerBar: number;
  fps: number;
  playbackSpeed: number;
  recordingLeadSeconds: number;
}) {
  const { snapshot, range } = input;
  const framesPerBar = Math.max(1, Math.round(input.framesPerBar));
  const fps = Math.max(1, safeNumber(input.fps, 1));
  const speed = normalizePlaybackSpeed(input.playbackSpeed);
  const lead = Math.max(0, safeNumber(input.recordingLeadSeconds));
  const firstBar = Math.floor(range.startFrame / framesPerBar);
  const lastBar = Math.max(firstBar, Math.ceil(range.endFrame / framesPerBar) - 1);
  const eventMap: PracticeRatingEventMap = {};
  let eventIndex = 0;

  const toSeconds = (frame: number) =>
    lead + (frame - range.startFrame) / (fps * speed);
  const bars: PracticeRatingRequestBar[] = Array.from(
    { length: lastBar - firstBar + 1 },
    (_, offset) => {
      const barIndex = firstBar + offset;
      const barStartFrame = Math.max(range.startFrame, barIndex * framesPerBar);
      const barEndFrame = Math.min(range.endFrame, (barIndex + 1) * framesPerBar);
      return {
        bar_index: barIndex,
        start_time_s: toSeconds(barStartFrame),
        duration_s: Math.max(0.01, (barEndFrame - barStartFrame) / (fps * speed)),
        note_events: [],
      };
    }
  );
  const barByIndex = new Map(bars.map((bar) => [bar.bar_index, bar]));

  const pushEvent = (
    frame: number,
    length: number,
    pitchMidi: number,
    placementKey: string
  ) => {
    if (frame < range.startFrame || frame >= range.endFrame || pitchMidi <= 0) return;
    const barIndex = Math.floor(frame / framesPerBar);
    const bar = barByIndex.get(barIndex);
    if (!bar) return;
    const sourceIndex = eventIndex++;
    bar.note_events.push({
      source_index: sourceIndex,
      start_time_s: toSeconds(frame),
      end_time_s: toSeconds(Math.max(frame + 1, frame + length)),
      pitch_midi: Math.round(pitchMidi),
      amplitude: 1,
      pitch_bend: null,
    });
    eventMap[sourceIndex] = {
      placementKey,
      frame,
      barIndex,
      pitchMidi: Math.round(pitchMidi),
    };
  };

  snapshot.notes.forEach((note) => {
    pushEvent(
      Math.round(note.startTime),
      Math.max(1, Math.round(note.length)),
      safeNumber(note.midiNum) || resolveTabMidi(snapshot, note.tab),
      `note-${note.id}`
    );
  });
  snapshot.chords.forEach((chord) => {
    chord.currentTabs.forEach((tab, tabIndex) => {
      pushEvent(
        Math.round(chord.startTime),
        Math.max(1, Math.round(chord.length)),
        resolveTabMidi(snapshot, tab, chord.originalMidi?.[tabIndex]),
        `chord-${chord.id}-${tabIndex}`
      );
    });
  });

  // A rest-only bar has nothing to grade. Sending it to the scorer produces
  // an empty result which used to be displayed as a misleading 100% score.
  return { bars: bars.filter((bar) => bar.note_events.length > 0), eventMap };
}

export function encodeMonoWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return new Blob([buffer], { type: "audio/wav" });
}

export function normalizePracticeRatingReplay(input: {
  laneId: string;
  startFrame: number;
  endFrame: number;
  playbackSpeed: number;
  eventMap: PracticeRatingEventMap;
  responseBars: any[];
  fps: number;
  recordingLeadSeconds: number;
  framesPerBar: number;
}): PracticeRatingReplay {
  const notes: PracticeRatingNote[] = [];
  const falseNotes: PracticeRatingFalseNote[] = [];
  const bars: PracticeRatingBar[] = [];
  const speed = normalizePlaybackSpeed(input.playbackSpeed);

  (Array.isArray(input.responseBars) ? input.responseBars : []).forEach((barResult) => {
    const barIndex = Math.round(safeNumber(barResult?.bar_index));
    let correct = 0;
    let timing = 0;
    let missed = 0;
    let earnedTimingAccuracy = 0;
    (Array.isArray(barResult?.notes) ? barResult.notes : []).forEach((note: any) => {
      const mapped = input.eventMap[Math.round(safeNumber(note?.event_index, -1))];
      if (!mapped) return;
      const timingAccuracy = safeNumber(note?.timing_accuracy);
      const status: PracticeRatingStatus =
        note?.status === "missed"
          ? "missed"
          : timingAccuracy >= 85
          ? "correct"
          : "timing";
      if (status === "correct") correct += 1;
      else if (status === "timing") timing += 1;
      else missed += 1;
      if (status !== "missed") {
        earnedTimingAccuracy += Math.max(0, Math.min(100, timingAccuracy)) / 100;
      }
      notes.push({
        eventIndex: Math.round(safeNumber(note?.event_index)),
        placementKey: mapped.placementKey,
        frame: mapped.frame,
        barIndex: mapped.barIndex,
        pitchMidi: mapped.pitchMidi,
        status,
        timingAccuracy,
        onsetErrorMs: note?.onset_error_ms == null ? null : safeNumber(note.onset_error_ms),
      });
    });
    const rawFalseNotes = Array.isArray(barResult?.false_notes) ? barResult.false_notes : [];
    rawFalseNotes.forEach((note: any) => {
      const secondsFromPlayback =
        safeNumber(note?.start_time_s) - Math.max(0, input.recordingLeadSeconds);
      const frame =
        input.startFrame + Math.max(0, secondsFromPlayback) * input.fps * speed;
      falseNotes.push({
        frame,
        barIndex,
        pitchMidi: Math.round(safeNumber(note?.pitch_midi)),
        confidence: safeNumber(note?.confidence),
      });
    });
    const total = correct + timing + missed + rawFalseNotes.length;
    if (total === 0) return;
    bars.push({
      barIndex,
      score:
        total > 0
          ? Math.round((earnedTimingAccuracy / total) * 100)
          : 100,
      correct,
      timing,
      missed,
      falseNotes: rawFalseNotes.length,
    });
  });

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    laneId: input.laneId,
    startFrame: input.startFrame,
    endFrame: input.endFrame,
    playbackSpeed: speed,
    notes,
    falseNotes,
    bars,
  };
}
