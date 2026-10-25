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
  1: { upcoming: "#16bce8", active: "#a0efff", blackActive: "#129bc8", border: "#6fe5ff" },
  2: { upcoming: "#28d973", active: "#b0ffcb", blackActive: "#15ae58", border: "#79ffa9" },
} as const;
export function practiceKeyIllumination(start: number, length: number, frame: number, horizon: number, height: number, fps: number) {
  if (frame < start || frame >= start + length) return 0;
  const gap = Math.min(length / 2, PRACTICE_NOTE_GAP_PX * horizon / Math.max(1, height));
  const release = start + length - gap;
  if (frame >= release) return 0.85 * Math.max(0, 1 - (frame - release) / Math.max(0.001, Math.min(gap * 0.3, fps * 0.035)));
  const age = (frame - start) / Math.max(1, fps);
  return Math.min(1, 0.65 + age / 0.06) * (0.85 + 0.15 * Math.exp(-age / 0.12));
}
export function practiceVisibleStart(prefixEnds: number[], frame: number) {
  let low = 0, high = prefixEnds.length;
  while (low < high) { const mid = (low + high) >>> 1; if (prefixEnds[mid] <= frame) low = mid + 1; else high = mid; }
  return low;
}
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
