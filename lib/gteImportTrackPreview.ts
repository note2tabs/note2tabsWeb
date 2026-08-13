import type { TabCoord } from "../types/gte";

const STANDARD_TUNING_MIDI_HIGH_TO_LOW = [64, 59, 55, 50, 45, 40];

export type ImportTrackPreviewEvent = {
  start: number;
  duration: number;
  midi: number;
};

export function buildImportTrackPreviewEvents(
  stamps: Array<[number, TabCoord, number]>,
  fpsValue?: number
): ImportTrackPreviewEvent[] {
  if (!stamps.length) return [];
  const fps = Math.max(1, Math.round(Number(fpsValue) || 240));
  const firstFrame = Math.min(...stamps.map((stamp) => Math.max(0, Number(stamp[0]) || 0)));
  return stamps
    .map(([startFrame, tab, lengthFrames]) => ({
      start: (Math.max(0, Number(startFrame) || 0) - firstFrame) / fps,
      duration: Math.max(1, Number(lengthFrames) || 1) / fps,
      midi: (STANDARD_TUNING_MIDI_HIGH_TO_LOW[tab[0]] ?? 0) + Math.max(0, Number(tab[1]) || 0),
    }))
    .filter((event) => event.midi > 0)
    .sort((left, right) => left.start - right.start || left.midi - right.midi);
}
