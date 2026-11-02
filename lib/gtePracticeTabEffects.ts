import type { EditorSnapshot } from "../types/gte";
import type { PracticeTabLayout } from "./gtePracticeTabLayout";

export type PracticeTabEffect = {
  key: string; kind: "hammer" | "pull" | "slide" | "bend" | "release";
  row: number; path: string; arrow?: string;
  held?: boolean;
  hiddenTargetKey?: string;
  label?: string; labelX: number; labelY: number;
};

const bendAmount = (semitones: number) => semitones === 2 ? "full"
  : semitones % 2 ? `${semitones > 1 ? Math.floor(semitones / 2) : ""}½` : String(semitones / 2);

/** Practice-only engraving. Geometry and source musical events stay unchanged. */
export function buildPracticeTabEffects(snapshot: EditorSnapshot, layout: PracticeTabLayout): PracticeTabEffect[] {
  const frets = new Map(layout.frets.map(note => [note.key, note]));
  const bounds = new Map<number, { left: number; right: number }>();
  for (const measure of layout.measures) {
    const previous = bounds.get(measure.row);
    bounds.set(measure.row, {left: previous?.left ?? measure.x, right: measure.x + measure.width});
  }
  const result: PracticeTabEffect[] = [];
  for (const effect of snapshot.noteEffects ?? []) {
    const first = frets.get(`n:${effect.startNoteId}`), second = frets.get(`n:${effect.endNoteId}`);
    if (!first || !second || first.string !== second.string || first.start === second.start) continue;
    const [a, b] = first.start < second.start ? [first, second] : [second, first];
    const delta = Number(b.label) - Number(a.label);
    if (!Number.isFinite(delta) || !delta || ![0, 1, 2].includes(effect.type)) continue;
    const kind = effect.type === 0 ? delta > 0 ? "bend" : "release"
      : effect.type === 1 ? delta > 0 ? "hammer" : "pull" : "slide";
    for (let row = a.row; row <= b.row; row++) {
      const edges = bounds.get(row); if (!edges) continue;
      // Stop short of the actual fret glyphs, not the wider layout spacing boxes.
      const left = row === a.row ? a.x + a.label.length * 3.5 + 4 : edges.left + 4;
      const right = row === b.row ? b.x - b.label.length * 3.5 - 4 : edges.right - 4;
      if (right <= left) continue;
      const y = row * layout.rowHeight + layout.stringTop + a.string * layout.stringGap;
      const middle = (left + right) / 2, span = right - left;
      const item: PracticeTabEffect = {key: `${effect.id}:${row}`, kind, row, path: "", labelX: middle, labelY: y - 16};
      // A bend's destination is a sustained target pitch, not another fretted attack.
      if (kind === "bend") item.hiddenTargetKey = b.key;
      if (kind === "hammer" || kind === "pull") {
        // A balanced slur with near-vertical ends reads cleanly at short and
        // long spacings, unlike a shallow quadratic hump.
        item.path = `M${left} ${y - 4} C${left + span * 0.2} ${y - 15} ${right - span * 0.2} ${y - 15} ${right} ${y - 4}`;
        item.label = kind === "hammer" ? "H" : "P";
      } else if (kind === "slide") {
        const rise = delta > 0 ? 4 : -4;
        item.path = `M${left} ${y + rise} L${right} ${y - rise}`;
      } else {
        const release = kind === "release", endY = y - (release ? 1 : 14);
        const transition = release ? row === b.row : row === a.row;
        item.held = !transition;
        item.path = transition ? `M${left} ${y - (release ? 14 : 1)} C${left + span * 0.5} ${y - (release ? 14 : 1)} ${right} ${y - (release ? 12 : 3)} ${right} ${endY}`
          : `M${left} ${y - 14} H${right}`;
        if (transition) item.arrow = release
          ? `M${right - 3} ${endY - 5} L${right} ${endY} L${right + 3} ${endY - 5} Z`
          : `M${right - 3} ${endY + 5} L${right} ${endY} L${right + 3} ${endY + 5} Z`;
        if (transition) item.label = bendAmount(Math.abs(delta));
        item.labelX = right;
        item.labelY = Math.max(row * layout.rowHeight + 10, y - 19);
      }
      result.push(item);
    }
  }
  return result;
}
