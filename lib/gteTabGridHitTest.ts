/** Reject row gutters and the blank area after a short final row. */
export function isInsideTabGrid(x: number, y: number, rowStride: number, rowHeight: number, rows: number, rowWidth: (row: number) => number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || rowStride <= 0) return false;
  const row = Math.floor(y / rowStride);
  return row < rows && y - row * rowStride < rowHeight && x < rowWidth(row);
}
