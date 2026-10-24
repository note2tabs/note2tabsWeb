/** Shared onset/length quantizer for editor and transcriber import.
 * Items that sound together move together, ends land on the grid, and items that
 * share a `key` (same pitch, or same string on tab) never overlap afterwards. */
export type QuantizeItem = { id: string | number; start: number; length: number; keys?: string[] };
export type QuantizeOptions = {
  step: number; strength?: number; quantizeLength?: boolean;
  /** Starts within this fraction of a step are treated as one onset. */
  clusterTolerance?: number;
  /** Join same-key pieces separated by less than half a step (model fragments). Off by default. */
  mergeFragments?: boolean;
};
export type QuantizedItem = { start: number; length: number } | null;

export function quantizeItems(items: readonly QuantizeItem[], options: QuantizeOptions): Map<string | number, QuantizedItem> {
  const step = Math.max(1e-6, options.step), strength = Math.max(0, Math.min(1, options.strength ?? 1));
  const lengths = options.quantizeLength !== false, tolerance = step * (options.clusterTolerance ?? 1 / 3);
  const work = items.map((item) => ({ item, start: Math.max(0, item.start), end: Math.max(0, item.start) + Math.max(1e-6, item.length), dropped: false }));
  if (options.mergeFragments) {
    const byKey = new Map<string, typeof work>();
    for (const entry of work) for (const key of entry.item.keys ?? []) byKey.set(key, [...(byKey.get(key) ?? []), entry]);
    for (const list of byKey.values()) {
      list.sort((a, b) => a.start - b.start);
      let current = list[0];
      for (let i = 1; i < list.length; i++) {
        const next = list[i], gap = next.start - current.end;
        if (gap > 0 && gap < step / 2 && current.item.keys?.length === 1 && next.item.keys?.length === 1) { current.end = Math.max(current.end, next.end); next.dropped = true; } else current = next;
      }
    }
  }
  const live = work.filter((entry) => !entry.dropped).sort((a, b) => a.start - b.start);
  // One snap target per onset cluster keeps chords and strums intact.
  const target = new Map<typeof work[number], number>();
  for (let i = 0; i < live.length;) {
    let j = i + 1;
    while (j < live.length && live[j].start - live[i].start <= tolerance) j++;
    const group = live.slice(i, j), mean = group.reduce((sum, entry) => sum + entry.start, 0) / group.length;
    const snapped = Math.max(0, Math.round(mean / step) * step);
    for (const entry of group) target.set(entry, snapped);
    i = j;
  }
  const result = live.map((entry) => {
    const snappedStart = target.get(entry)!, start = entry.start + (snappedStart - entry.start) * strength;
    let end = entry.end;
    if (lengths) end = entry.end + (Math.max(snappedStart + step, Math.round(entry.end / step) * step) - entry.end) * strength;
    return { entry, start: Math.round(start), end: Math.max(Math.round(start) + 1, Math.round(end)) };
  });
  const byKey = new Map<string, typeof result>();
  for (const row of result) for (const key of row.entry.item.keys ?? []) byKey.set(key, [...(byKey.get(key) ?? []), row]);
  const dropped = new Set<typeof result[number]>();
  for (const list of byKey.values()) {
    list.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    let current = list[0];
    for (let i = 1; i < list.length; i++) {
      const next = list[i];
      if (dropped.has(current)) { current = next; continue; }
      if (next.start <= current.start) {
        // Two events cannot share a key at one onset; only lone-key notes are safe to discard.
        if (next.entry.item.keys?.length === 1) { dropped.add(next); continue; }
        current.end = current.start + 1;
      } else if (current.end > next.start) current.end = next.start;
      current = next;
    }
  }
  const out = new Map<string | number, QuantizedItem>();
  for (const entry of work) if (entry.dropped) out.set(entry.item.id, null);
  for (const row of result) out.set(row.entry.item.id, dropped.has(row) ? null : { start: row.start, length: row.end - row.start });
  return out;
}
