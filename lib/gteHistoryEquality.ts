/** Compare content without letting server timestamps/version acknowledgements
 * consume undo slots or invalidate redo. Shared, unchanged branches are O(1). */
export function sameHistoryContent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameHistoryContent(value, right[index]));
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = (value: Record<string, unknown>) => Object.keys(value)
    .filter((key) => key !== "updatedAt" && key !== "version" && value[key] !== undefined);
  const aKeys = keys(a), bKeys = keys(b);
  return aKeys.length === bKeys.length && aKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(b, key) && sameHistoryContent(a[key], b[key]));
}
