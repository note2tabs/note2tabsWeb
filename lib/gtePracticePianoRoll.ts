const centers = [0.5, 1, 1.5, 2, 2.5, 3.5, 4, 4.5, 5, 5.5, 6, 6.5];
export const pianoPitchCenter = (pitch: number) => Math.floor(pitch / 12) * 7 + centers[pitch % 12];
export const isBlackPianoKey = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);
export const PRACTICE_NOTE_GAP_PX = 4;
export function practiceKeyActive(start: number, length: number, frame: number, horizon: number, height: number) {
  // Release at the painted trailing edge, then retrigger at the next onset.
  // Cap the gap for very short notes so their key highlight still appears.
  const gapFrames = Math.min(length / 2, PRACTICE_NOTE_GAP_PX * horizon / Math.max(1, height));
  return frame >= start && frame < start + length - gapFrames;
}
export const PRACTICE_VOICE_COLORS = {
  1: { upcoming: "#429c83", active: "#70d9b0", border: "#26735f" },
  2: { upcoming: "#6c8ed0", active: "#a3beff", border: "#4e6faa" },
} as const;
export function practicePitchRange(pitches: number[]) {
  let low = 60, high = 71;
  if (pitches.length) { low = 127; high = 0; for (const pitch of pitches) { low = Math.min(low, pitch); high = Math.max(high, pitch); } }
  low = Math.max(0, Math.floor((low - 2) / 12) * 12);
  high = Math.min(127, Math.ceil((high + 3) / 12) * 12 - 1);
  // At least five octaves avoids oversized keys on sparse tracks.
  const missing = Math.max(0, 60 - (high - low + 1));
  low = Math.max(0, low - Math.ceil(missing / 24) * 12);
  high = Math.min(127, Math.max(high, low + 59));
  low = Math.max(0, Math.min(low, high - 59));
  return { low, high };
}
export function practiceNoteWindow(start: number, length: number, frame: number, horizon: number, height: number) {
  const end = start + length;
  if (end <= frame || start > frame + horizon) return null;
  const top = Math.max(0, height - (end - frame) / horizon * height);
  const bottom = Math.min(height, height - (start - frame) / horizon * height);
  return bottom > top ? { top, bottom, active: start <= frame && frame < end } : null;
}
