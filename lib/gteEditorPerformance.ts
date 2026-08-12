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
  const keep = Math.max(0, Math.round(maximum) - 1);
  return [...history.slice(-keep), snapshot];
};
