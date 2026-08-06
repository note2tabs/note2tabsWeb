import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";

export type ScalePitchKey = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PitchClassDistribution = Record<ScalePitchKey, number>;

export type ScalePattern = {
  type: string;
  intervals: readonly number[];
};

export type ScaleDetectionCandidate = {
  rootKey: ScalePitchKey;
  root: string;
  scaleType: string;
  rmsDifference: number;
  keyDistribution: PitchClassDistribution;
  normalizedKeyDistribution: PitchClassDistribution;
};

export type ScaleDetectionResult = ScaleDetectionCandidate & {
  totalNotes: number;
  midiCounts: Record<number, number>;
  pitchClassCounts: PitchClassDistribution;
  normalizedDistribution: PitchClassDistribution;
  candidates: ScaleDetectionCandidate[];
};

const PITCH_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const SCALE_NOTE_NAMES: Record<ScalePitchKey, string> = {
  1: "C",
  2: "C#",
  3: "D",
  4: "D#",
  5: "E",
  6: "F",
  7: "F#",
  8: "G",
  9: "G#",
  10: "A",
  11: "A#",
  12: "B",
};

export const GTE_SCALE_PATTERNS: readonly ScalePattern[] = [
  { type: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { type: "Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { type: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { type: "Melodic Minor", intervals: [0, 2, 3, 5, 7, 9, 11] },
  { type: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { type: "Phyrigian", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { type: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] },
  { type: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { type: "Major Blues", intervals: [0, 2, 3, 4, 7, 9] },
  { type: "Minor Blues", intervals: [0, 3, 5, 6, 7, 10] },
];

const isCanvasSnapshot = (snapshot: CanvasSnapshot | EditorSnapshot): snapshot is CanvasSnapshot =>
  Array.isArray((snapshot as CanvasSnapshot).editors);

const emptyPitchClassDistribution = (): PitchClassDistribution => ({
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  8: 0,
  9: 0,
  10: 0,
  11: 0,
  12: 0,
});

export const midiToScalePitchKey = (midiNum: number): ScalePitchKey =>
  ((((Math.round(midiNum) % 12) + 12) % 12) + 1) as ScalePitchKey;

const incrementMidiCount = (counts: Record<number, number>, midiNum: unknown) => {
  const midi = Math.round(Number(midiNum));
  if (!Number.isFinite(midi)) return;
  counts[midi] = (counts[midi] || 0) + 1;
};

export const collectEditorMidiCounts = (snapshot: Pick<EditorSnapshot, "notes" | "chords">) => {
  const counts: Record<number, number> = {};

  for (const note of snapshot.notes || []) {
    incrementMidiCount(counts, note.midiNum);
  }

  for (const chord of snapshot.chords || []) {
    const chordMidi = chord.originalMidi?.length ? chord.originalMidi : chord.fingering?.midiNotes || [];
    for (const midi of chordMidi) {
      incrementMidiCount(counts, midi);
    }
  }

  return counts;
};

export const collectGteMidiCounts = (snapshot: CanvasSnapshot | EditorSnapshot) => {
  if (!isCanvasSnapshot(snapshot)) return collectEditorMidiCounts(snapshot);

  const counts: Record<number, number> = {};
  for (const editor of snapshot.editors || []) {
    const editorCounts = collectEditorMidiCounts(editor);
    for (const [midi, amount] of Object.entries(editorCounts)) {
      const midiNum = Number(midi);
      counts[midiNum] = (counts[midiNum] || 0) + amount;
    }
  }
  return counts;
};

export const buildPitchClassCounts = (midiCounts: Record<number, number>) => {
  const counts = emptyPitchClassDistribution();

  for (const [midi, amount] of Object.entries(midiCounts)) {
    const pitchKey = midiToScalePitchKey(Number(midi));
    counts[pitchKey] += amount;
  }

  return counts;
};

export const normalizePitchClassDistribution = (distribution: PitchClassDistribution) => {
  const total = PITCH_KEYS.reduce((sum, key) => sum + distribution[key], 0);
  const normalized = emptyPitchClassDistribution();
  if (total <= 0) return normalized;

  for (const key of PITCH_KEYS) {
    normalized[key] = distribution[key] / total;
  }

  return normalized;
};

export const buildScaleKeyDistribution = (
  rootKey: ScalePitchKey,
  intervals: readonly number[]
): PitchClassDistribution => {
  const distribution = emptyPitchClassDistribution();

  for (const interval of intervals) {
    const pitchKey = ((((rootKey - 1 + interval) % 12) + 12) % 12) + 1;
    distribution[pitchKey as ScalePitchKey] = 1;
  }

  return distribution;
};

export const getRootMeanSquaredDifference = (
  left: PitchClassDistribution,
  right: PitchClassDistribution
) => {
  const squaredDifference = PITCH_KEYS.reduce((sum, key) => {
    const difference = left[key] - right[key];
    return sum + difference * difference;
  }, 0);
  return Math.sqrt(squaredDifference / PITCH_KEYS.length);
};

export function detectEditorScale(
  snapshot: CanvasSnapshot | EditorSnapshot,
  patterns: readonly ScalePattern[] = GTE_SCALE_PATTERNS
): ScaleDetectionResult | null {
  const midiCounts = collectGteMidiCounts(snapshot);
  const pitchClassCounts = buildPitchClassCounts(midiCounts);
  const normalizedDistribution = normalizePitchClassDistribution(pitchClassCounts);
  const totalNotes = PITCH_KEYS.reduce((sum, key) => sum + pitchClassCounts[key], 0);

  if (totalNotes <= 0) return null;

  const candidates: ScaleDetectionCandidate[] = [];

  for (const rootKey of PITCH_KEYS) {
    for (const pattern of patterns) {
      const keyDistribution = buildScaleKeyDistribution(rootKey, pattern.intervals);
      const normalizedKeyDistribution = normalizePitchClassDistribution(keyDistribution);
      candidates.push({
        rootKey,
        root: SCALE_NOTE_NAMES[rootKey],
        scaleType: pattern.type,
        rmsDifference: getRootMeanSquaredDifference(normalizedDistribution, normalizedKeyDistribution),
        keyDistribution,
        normalizedKeyDistribution,
      });
    }
  }

  candidates.sort((left, right) => left.rmsDifference - right.rmsDifference);
  const best = candidates[0];

  return {
    ...best,
    totalNotes,
    midiCounts,
    pitchClassCounts,
    normalizedDistribution,
    candidates,
  };
}

export const detectGteScale = detectEditorScale;
