import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";

export type TimelineFrameWindow = {
  startFrame: number;
  endFrame: number;
};

type TimelineEvent = {
  id: number;
  startTime: number;
  length: number;
};

/** Keeps interactive items mounted while limiting ordinary timeline DOM to the viewport. */
export const windowTimelineEvents = <T extends TimelineEvent>(
  events: readonly T[],
  window: TimelineFrameWindow,
  pinnedIds: ReadonlySet<number> = new Set<number>()
): T[] =>
  events.filter((event) => {
    if (pinnedIds.has(event.id)) return true;
    const start = Math.round(event.startTime);
    const end = start + Math.max(1, Math.round(event.length));
    return end >= window.startFrame && start <= window.endFrame;
  });

/**
 * Replaces one lane while preserving every unrelated lane reference. This is
 * important for large scores: a one-note edit must not manufacture nine other
 * 10,000-note lane objects or make them look changed to autosave/rendering.
 */
export const replaceCanvasLane = (
  canvas: CanvasSnapshot,
  laneId: string,
  nextLane: EditorSnapshot
): CanvasSnapshot => {
  const laneIndex = canvas.editors.findIndex((lane) => lane.id === laneId);
  if (laneIndex < 0 || canvas.editors[laneIndex] === nextLane) return canvas;
  const editors = canvas.editors.slice();
  editors[laneIndex] = nextLane;
  return { ...canvas, editors };
};

export const appendBoundedHistory = <T>(history: readonly T[], snapshot: T, maximum: number): T[] => {
  const limit = Math.max(0, Math.round(maximum));
  if (limit === 0) return [];
  const keep = limit - 1;
  if (keep === 0) return [snapshot];
  return [...history.slice(-keep), snapshot];
};

/**
 * Which stacked rows are near the viewport. `top` is where the first row starts
 * relative to the viewport's top edge (negative once scrolled past it). The range is
 * generous (overscan) so fast scrolling never shows empty rows, but it only changes
 * when a row boundary is crossed, so scrolling does not re-render per pixel.
 */
export const visibleRowRange = (
  top: number,
  viewportHeight: number,
  rowStride: number,
  rows: number,
  overscanPx: number
): { first: number; last: number } => {
  const stride = Math.max(1, rowStride);
  const overscan = Math.max(stride, overscanPx);
  const first = Math.max(0, Math.min(rows - 1, Math.floor((-top - overscan) / stride)));
  const last = Math.min(rows - 1, Math.max(first, Math.ceil((viewportHeight - top + overscan) / stride)));
  return { first, last };
};
