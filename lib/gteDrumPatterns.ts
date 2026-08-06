import type { Note } from "../types/gte";
import { buildDrumNote, DRUM_VOICES, type DrumVoiceId } from "./gteDrums";

export type DrumBeatPatternId =
  | "bare-half-time"
  | "minimal-half-time"
  | "slow-rock"
  | "slow-blues"
  | "driving-rock"
  | "funk-pocket";

type PatternHit = {
  voice: DrumVoiceId;
  beat: number;
};

export type DrumBeatPattern = {
  id: DrumBeatPatternId;
  label: string;
  description: string;
  cycleBeats: number;
  hits: PatternHit[];
};

export const DRUM_BEAT_PATTERNS: readonly DrumBeatPattern[] = [
  {
    id: "bare-half-time",
    label: "Bare Half-Time",
    description: "Only a kick on beat one and snare on beat three",
    cycleBeats: 4,
    hits: [
      { voice: "kick", beat: 0 },
      { voice: "snare", beat: 2 },
    ],
  },
  {
    id: "minimal-half-time",
    label: "Minimal Half-Time",
    description: "Half-note hats supporting a single kick and snare",
    cycleBeats: 4,
    hits: [
      ...[0, 2].map((beat) => ({ voice: "closed_hi_hat" as const, beat })),
      { voice: "kick", beat: 0 },
      { voice: "snare", beat: 2 },
    ],
  },
  {
    id: "slow-rock",
    label: "Slow Rock",
    description: "Quarter-note hats with the basic rock kick and backbeat",
    cycleBeats: 4,
    hits: [
      ...[0, 1, 2, 3].map((beat) => ({ voice: "closed_hi_hat" as const, beat })),
      ...[0, 2].map((beat) => ({ voice: "kick" as const, beat })),
      ...[1, 3].map((beat) => ({ voice: "snare" as const, beat })),
    ],
  },
  {
    id: "slow-blues",
    label: "Slow Blues",
    description: "Spacious long-short shuffle with a half-time backbeat",
    cycleBeats: 4,
    hits: [
      ...[0, 2 / 3, 2, 2 + 2 / 3].map((beat) => ({
        voice: "closed_hi_hat" as const,
        beat,
      })),
      ...[0, 2].map((beat) => ({ voice: "kick" as const, beat })),
      { voice: "snare", beat: 2 },
    ],
  },
  {
    id: "driving-rock",
    label: "Driving Rock",
    description: "Eighth-note hats, a firm backbeat, and a syncopated kick pickup",
    cycleBeats: 4,
    hits: [
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: "closed_hi_hat" as const,
        beat,
      })),
      ...[0, 2, 2.5].map((beat) => ({ voice: "kick" as const, beat })),
      ...[1, 3].map((beat) => ({ voice: "snare" as const, beat })),
    ],
  },
  {
    id: "funk-pocket",
    label: "Funk Pocket",
    description: "Eighth-note hats with syncopated kicks around a steady backbeat",
    cycleBeats: 4,
    hits: [
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: "closed_hi_hat" as const,
        beat,
      })),
      ...[0, 0.75, 2.25, 3.5].map((beat) => ({ voice: "kick" as const, beat })),
      ...[1, 3].map((beat) => ({ voice: "snare" as const, beat })),
    ],
  },
] as const;

export const applyDrumBeatPattern = (input: {
  notes: Note[];
  barIndices: number[];
  patternId: DrumBeatPatternId;
  beatsPerBar: number;
  framesPerBar: number;
}): Note[] => {
  const pattern = DRUM_BEAT_PATTERNS.find((candidate) => candidate.id === input.patternId);
  if (!pattern) return input.notes;
  const framesPerBar = Math.max(1, Math.round(input.framesPerBar));
  const beatsPerBar = Math.max(1, Math.round(input.beatsPerBar));
  const selectedBars = new Set(
    input.barIndices.filter((barIndex) => Number.isInteger(barIndex) && barIndex >= 0)
  );
  if (!selectedBars.size) return input.notes;

  const retainedNotes = input.notes.filter(
    (note) => !selectedBars.has(Math.floor(note.startTime / framesPerBar))
  );
  let nextId = input.notes.reduce((maximum, note) => Math.max(maximum, note.id), 0) + 1;
  const patternBeats = Math.min(beatsPerBar, pattern.cycleBeats);
  const hitLength = Math.max(
    1,
    Math.min(30, Math.round(framesPerBar / patternBeats / 4))
  );
  const generatedNotes: Note[] = [];

  [...selectedBars]
    .sort((left, right) => left - right)
    .forEach((barIndex) => {
      const barStart = barIndex * framesPerBar;
      pattern.hits.forEach((hit) => {
        if (hit.beat >= patternBeats) return;
        const voiceIndex = DRUM_VOICES.findIndex((voice) => voice.id === hit.voice);
        generatedNotes.push(
          buildDrumNote({
            id: nextId++,
            startTime: barStart + Math.round((hit.beat / patternBeats) * framesPerBar),
            voiceIndex,
            length: hitLength,
          })
        );
      });
    });

  return [...retainedNotes, ...generatedNotes].sort(
    (left, right) => left.startTime - right.startTime || left.id - right.id
  );
};
