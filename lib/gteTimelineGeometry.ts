export const GTE_TIMELINE_GUTTER_WIDTH = 58;
export const GTE_TIMELINE_LABEL_COLUMN_WIDTH = 50;
export const GTE_TIMELINE_COLUMN_GAP = 8;
export const GTE_TIMELINE_END_PADDING = 40;

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
