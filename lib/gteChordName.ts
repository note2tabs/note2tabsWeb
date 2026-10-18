const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SHAPES = [
  { suffix: "", intervals: [0, 4, 7] },
  { suffix: "m", intervals: [0, 3, 7] },
  { suffix: "5", intervals: [0, 7] },
  { suffix: "dim", intervals: [0, 3, 6] },
  { suffix: "aug", intervals: [0, 4, 8] },
  { suffix: "sus2", intervals: [0, 2, 7] },
  { suffix: "sus4", intervals: [0, 5, 7] },
  { suffix: "6", intervals: [0, 4, 7, 9] },
  { suffix: "m6", intervals: [0, 3, 7, 9] },
  { suffix: "7", intervals: [0, 4, 7, 10] },
  { suffix: "maj7", intervals: [0, 4, 7, 11] },
  { suffix: "m7", intervals: [0, 3, 7, 10] },
  { suffix: "m(maj7)", intervals: [0, 3, 7, 11] },
  { suffix: "m7b5", intervals: [0, 3, 6, 10] },
  { suffix: "dim7", intervals: [0, 3, 6, 9] },
  { suffix: "7sus4", intervals: [0, 5, 7, 10] },
  { suffix: "add9", intervals: [0, 2, 4, 7] },
  { suffix: "m(add9)", intervals: [0, 2, 3, 7] },
  { suffix: "9", intervals: [0, 2, 4, 7, 10] },
  { suffix: "maj9", intervals: [0, 2, 4, 7, 11] },
  { suffix: "m9", intervals: [0, 2, 3, 7, 10] },
  { suffix: "11", intervals: [0, 2, 4, 5, 7, 10] },
  { suffix: "m11", intervals: [0, 2, 3, 5, 7, 10] },
  { suffix: "13", intervals: [0, 2, 4, 7, 9, 10] },
] as const;

export type ChordNameCandidate = { label: string; root: string; bass: string; probability: number };
export type ChordNameEstimate = ChordNameCandidate & { alternatives: ChordNameCandidate[] };

/**
 * A small, display-only probabilistic template model. Independent pitch-class
 * likelihoods penalize unexpected tones and tolerate omitted fifths. Bass/root
 * agreement supplies a weak prior. Softmax probabilities are relative model
 * weights, NOT calibrated confidence or a claim about harmonic context.
 */
export function estimateChordName(midis: readonly number[]): ChordNameEstimate | null {
  const valid = midis.filter((midi) => Number.isInteger(midi) && midi >= 0 && midi <= 127);
  const pitches = new Set(valid.map((midi) => midi % 12));
  if (pitches.size < 2 || pitches.size > 7) return null;
  const bass = Math.min(...valid) % 12;
  const candidates: Array<Omit<ChordNameCandidate, "probability"> & { score: number }> = [];
  for (let root = 0; root < 12; root++) {
    for (const shape of SHAPES) {
      // With two pitch classes, only an exact power chord is identifiable here.
      if (pitches.size === 2 && shape.suffix !== "5") continue;
      const intervals = new Set<number>(shape.intervals);
      let matches = 0;
      let extras = 0;
      let score = root === bass ? 0.65 : 0;
      for (let pitch = 0; pitch < 12; pitch++) {
        const interval = (pitch - root + 12) % 12;
        const expected = intervals.has(interval);
        const present = pitches.has(pitch);
        const probability = !expected ? 0.035 : interval === 0 ? 0.96 : interval === 7 ? 0.7 : 0.9;
        score += Math.log(present ? probability : 1 - probability);
        if (present) { if (expected) matches++; else extras++; }
      }
      // Do not invent names for clusters or dyads outside this model.
      if (matches < 2 || extras > 1 || matches / pitches.size < 0.75 || !pitches.has(root)) continue;
      const rootName = PITCH_NAMES[root];
      candidates.push({ label: `${rootName}${shape.suffix}${bass === root ? "" : `/${PITCH_NAMES[bass]}`}`, root: rootName, bass: PITCH_NAMES[bass], score });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const peak = candidates[0].score;
  const normalizer = candidates.reduce((sum, item) => sum + Math.exp(item.score - peak), 0);
  const ranked = candidates.map(({ score, ...candidate }) => ({ ...candidate, probability: Math.exp(score - peak) / normalizer }));
  return { ...ranked[0], alternatives: ranked.slice(0, 3) };
}
