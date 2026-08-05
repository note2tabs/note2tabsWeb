import type { Note } from "../types/gte";
import { buildDrumNote, DRUM_VOICES, type DrumVoiceId } from "./gteDrums";

export type DrumBeatPatternId =
  | "slow-ballad"
  | "classic-rock"
  | "four-on-the-floor"
  | "half-time"
  | "funk"
  | "disco"
  | "punk";

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

const eighths = Array.from({ length: 8 }, (_, index) => index / 2);
const sixteenths = Array.from({ length: 16 }, (_, index) => index / 4);

export const DRUM_BEAT_PATTERNS: readonly DrumBeatPattern[] = [
  {
    id: "slow-ballad",
    label: "Slow Ballad",
    description: "Very sparse half-note pulse for high-tempo projects",
    cycleBeats: 4,
    hits: [
      ...[0, 2].map((beat) => ({ voice: "closed_hi_hat" as const, beat })),
      { voice: "kick", beat: 0 },
      { voice: "snare", beat: 2 },
      { voice: "cymbal", beat: 0 },
    ],
  },
  {
    id: "classic-rock",
    label: "Slow Rock",
    description: "Simple quarter-note hats with a restrained backbeat",
    cycleBeats: 4,
    hits: [
      ...[0, 1, 2, 3].map((beat) => ({ voice: "closed_hi_hat" as const, beat })),
      ...[0, 2].map((beat) => ({ voice: "kick" as const, beat })),
      ...[1, 3].map((beat) => ({ voice: "snare" as const, beat })),
      { voice: "cymbal", beat: 0 },
    ],
  },
  {
    id: "four-on-the-floor",
    label: "Four on the Floor",
    description: "Steady dance kick with uncluttered quarter-note hats",
    cycleBeats: 4,
    hits: [
      ...[0, 1, 2, 3].map((beat) => ({ voice: "kick" as const, beat })),
      ...[1, 3].map((beat) => ({ voice: "snare" as const, beat })),
      ...[0, 1, 2, 3].map((beat) => ({ voice: "closed_hi_hat" as const, beat })),
    ],
  },
  {
    id: "half-time",
    label: "Half-Time",
    description: "Sparse heavy pocket with one snare per bar",
    cycleBeats: 4,
    hits: [
      ...[0, 1, 2, 3].map((beat) => ({ voice: "closed_hi_hat" as const, beat })),
      ...[0, 3].map((beat) => ({ voice: "kick" as const, beat })),
      { voice: "snare", beat: 2 },
    ],
  },
  {
    id: "funk",
    label: "Funk (Busy)",
    description: "Syncopated kick beneath busy sixteenth-note hats",
    cycleBeats: 4,
    hits: [
      ...sixteenths
        .filter((beat) => beat !== 1.5 && beat !== 3.5)
        .map((beat) => ({ voice: "closed_hi_hat" as const, beat })),
      ...[1.5, 3.5].map((beat) => ({ voice: "open_hi_hat" as const, beat })),
      ...[0, 0.75, 2, 2.75, 3.5].map((beat) => ({ voice: "kick" as const, beat })),
      ...[1, 3].map((beat) => ({ voice: "snare" as const, beat })),
    ],
  },
  {
    id: "disco",
    label: "Disco",
    description: "Four kicks, backbeat snares, and open offbeat hats",
    cycleBeats: 4,
    hits: [
      ...[0, 1, 2, 3].map((beat) => ({ voice: "kick" as const, beat })),
      ...[1, 3].map((beat) => ({ voice: "snare" as const, beat })),
      ...[0, 1, 2, 3].map((beat) => ({ voice: "closed_hi_hat" as const, beat })),
      ...[0.5, 1.5, 2.5, 3.5].map((beat) => ({ voice: "open_hi_hat" as const, beat })),
      { voice: "cymbal", beat: 0 },
    ],
  },
  {
    id: "punk",
    label: "Punk (Fast)",
    description: "Fast alternating kicks with a strong backbeat",
    cycleBeats: 4,
    hits: [
      ...eighths.map((beat) => ({ voice: "closed_hi_hat" as const, beat })),
      ...[0, 0.5, 2, 2.5].map((beat) => ({ voice: "kick" as const, beat })),
      ...[1, 3].map((beat) => ({ voice: "snare" as const, beat })),
      { voice: "cymbal", beat: 0 },
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
