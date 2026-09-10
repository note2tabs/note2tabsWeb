export const GTE_TIMELINE_GUTTER_WIDTH = 58;
export const GTE_TIMELINE_LABEL_COLUMN_WIDTH = 50;
export const GTE_TIMELINE_COLUMN_GAP = 8;
export const GTE_TIMELINE_END_PADDING = 40;

export const shouldAddBarStartNewRow = (
  lastRowBarCount: number,
  configuredBarsPerRow: number
) => {
  const safeBarCount = Math.max(0, Math.round(Number(lastRowBarCount) || 0));
  const safeRowCapacity = Math.max(1, Math.round(Number(configuredBarsPerRow) || 1));
  return safeBarCount >= safeRowCapacity;
};

export const getTimelineBaseScale = (
  availableWidth: number,
  framesPerBar: number,
  barsPerRow: number
) =>
  Math.max(
    0.1,
    Math.max(0, Number(availableWidth) || 0) /
      Math.max(1, Math.max(1, Number(framesPerBar) || 1) * Math.max(1, Math.round(Number(barsPerRow) || 1)))
  );

export const getScaledDrumHitSize = (
  gridCellWidth: number,
  rowHeight: number,
  maximumSize = 24
) => {
  const safeCellWidth = Math.max(0.1, Number(gridCellWidth) || 0.1);
  const horizontalInset = Math.min(2, safeCellWidth * 0.2);
  return Math.max(
    0.1,
    Math.min(
      Math.max(0.1, Number(maximumSize) || 0.1),
      Math.max(0.1, Number(rowHeight) - 4 || 0.1),
      safeCellWidth - horizontalInset
    )
  );
};
