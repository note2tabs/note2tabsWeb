export type MobileGridCursor = {
  time: number;
  stringIndex: number;
};

/** Notes own their tap gesture, but the visible cursor remains a timeline tap target. */
export const isMobileTimelineTapEligible = (touchesNote: boolean) => !touchesNote;

export const isSameMobileGridCursor = (
  current: MobileGridCursor | null | undefined,
  target: MobileGridCursor,
  timeTolerance = 0
) =>
  current != null &&
  Math.abs(current.time - target.time) <= Math.max(0, timeTolerance) &&
  current.stringIndex === target.stringIndex;
