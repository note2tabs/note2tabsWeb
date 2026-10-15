import type { TabCoord } from "../types/gte";

export type InspectorRect = { left: number; top: number; right: number; bottom: number };

/** Find a viewport-bounded free rectangle, without changing canvas zoom or scroll. */
export function placePropertiesInspector(
  viewport: { width: number; height: number },
  obstacles: InspectorRect[],
  anchor: { x: number; y: number },
  preferredHeight = 0,
) {
  const margin = 12;
  const gap = 12;
  const width = Math.min(320, Math.max(1, viewport.width - margin * 2));
  const maxHeight = Math.max(1, viewport.height - margin * 2);
  const visible = obstacles.filter((rect) => rect.right > 0 && rect.left < viewport.width && rect.bottom > 0 && rect.top < viewport.height);
  const xs = [viewport.width - width - margin, margin, ...visible.flatMap((rect) => [rect.left - width - gap, rect.right + gap])];
  const ys = [Math.max(margin, Math.min(anchor.y - 80, viewport.height - 180)), margin, ...visible.map((rect) => rect.bottom + gap)];
  const candidates: Array<{ left: number; top: number; width: number; maxHeight: number; score: number }> = [];
  for (const left of xs) {
    if (left < margin || left + width > viewport.width - margin) continue;
    for (const top of ys) {
      if (top < margin || top >= viewport.height - margin) continue;
      let bottom = viewport.height - margin;
      for (const rect of visible) {
        if (rect.right + gap <= left || rect.left - gap >= left + width || rect.bottom + gap <= top) continue;
        bottom = Math.min(bottom, rect.top - gap);
      }
      const height = Math.min(620, bottom - top);
      if (height < Math.min(160, maxHeight)) continue;
      candidates.push({ left, top, width, maxHeight: height, score: (preferredHeight > 0 && height >= preferredHeight ? 100_000 : 0) + height * 4 - Math.abs(top - anchor.y) - Math.abs(left - anchor.x) * 0.1 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  // A very large selection can occupy the whole viewport. The shell then uses
  // an explicit bottom sheet rather than an offscreen/unreachable popover.
  return candidates[0] ?? { left: margin, top: Math.max(margin, viewport.height * 0.55), width, maxHeight: Math.min(maxHeight, viewport.height * 0.45 - margin), score: 0 };
}

/** Compare a multiset: order is irrelevant, but repeated pitches/positions aren't. */
export function sameInspectorFingering(a: TabCoord[], b: TabCoord[]) {
  const key = (tabs: TabCoord[]) => tabs.map(([string, fret]) => `${string}:${fret}`).sort().join("|");
  return a.length === b.length && key(a) === key(b);
}

export function inspectorStringFrets(tabs: TabCoord[], stringCount: number) {
  return Array.from({ length: stringCount }, (_, string) => tabs.filter((tab) => tab[0] === string).map((tab) => tab[1]));
}
