import type { TranscriberTrack } from "./gteApi";
const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// Krumhansl–Kessler pitch profiles, duration weighted and Pearson correlated.
// https://music21.org/music21docs/_modules/music21/analysis/discrete.html
const profiles = [
  [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
];

/** Infer from original pitched events, never from an accumulated preview. */
export function detectImportedKey(tracks: readonly TranscriberTrack[]) {
  const counts = Array<number>(12).fill(0);
  for (const track of tracks) {
    if (track.trackType === "drums") continue;
    for (const note of track.segments) {
      if (!Number.isInteger(note.pitch_midi) || note.pitch_midi! < 0 || note.pitch_midi! > 127) continue;
      const duration = note.end_time_s! - note.start_time_s!;
      if (Number.isFinite(duration) && duration > 0) counts[note.pitch_midi! % 12] += duration;
    }
  }
  const mean = counts.reduce((sum, count) => sum + count, 0) / 12;
  const variance = counts.reduce((sum, count) => sum + (count - mean) ** 2, 0);
  if (!variance) return null;
  let best = { keyBase: 0, keyType: 0, correlation: -Infinity };
  profiles.forEach((profile, keyType) => {
    const profileMean = profile.reduce((sum, weight) => sum + weight, 0) / 12;
    const scale = Math.sqrt(variance * profile.reduce((sum, weight) => sum + (weight - profileMean) ** 2, 0));
    for (let keyBase = 0; keyBase < 12; keyBase++) {
      const correlation = counts.reduce((sum, count, pitch) => sum + (count - mean) * (profile[(pitch - keyBase + 12) % 12] - profileMean), 0) / scale;
      if (correlation > best.correlation) best = { keyBase, keyType, correlation };
    }
  });
  return { keyBase: best.keyBase, keyType: best.keyType, label: `${names[best.keyBase]} ${best.keyType ? "Minor" : "Major"}` };
}
