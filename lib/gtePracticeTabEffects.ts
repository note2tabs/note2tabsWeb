import type { EditorSnapshot } from "../types/gte";
import { practiceTabPosition, type PracticeTabLayout } from "./gtePracticeTabLayout";

export type PracticeTabEffect = {
  key: string; kind: "hammer" | "pull" | "slide" | "bend" | "release" | "vibrato";
  row: number; path: string; arrow?: string;
  held?: boolean;
  hiddenFretKey?: string;
  label?: string; labelX: number; labelY: number;
};

const bendAmount = (semitones: number) => semitones === 2 ? "full"
  : semitones % 2 ? `${semitones > 1 ? Math.floor(semitones / 2) : ""}½` : String(semitones / 2);

/** Practice-only engraving. Geometry and source musical events stay unchanged. */
export function buildPracticeTabEffects(snapshot: EditorSnapshot, layout: PracticeTabLayout): PracticeTabEffect[] {
  const frets = new Map(layout.frets.map(note => [note.key, note]));
  const bounds = new Map<number, { left: number; right: number; start: number; end: number }>();
  for (const measure of layout.measures) {
    const previous = bounds.get(measure.row);
    bounds.set(measure.row, {left: previous?.left ?? measure.x, right: measure.x + measure.width, start: previous?.start ?? measure.start, end: measure.end});
  }
  const result: PracticeTabEffect[] = [];
  const hiddenBendFrets = new Set<string>();
  for (const effect of snapshot.noteEffects ?? []) {
    if (effect.type !== 0) continue;
    const first = frets.get(`n:${effect.startNoteId}`), second = frets.get(`n:${effect.endNoteId}`);
    if (!first || !second || first.string !== second.string || first.start === second.start) continue;
    const delta = Number(second.label) - Number(first.label);
    if (!Number.isFinite(delta) || !delta) continue;
    hiddenBendFrets.add(Number(first.label) > Number(second.label) ? first.key : second.key);
  }
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
      let left = row === a.row ? a.x + (hiddenBendFrets.has(a.key) ? 0 : a.label.length * 3.5 + 4) : edges.left + 4;
      let right = row === b.row ? b.x - (hiddenBendFrets.has(b.key) ? 0 : b.label.length * 3.5 + 4) : edges.right - 4;
      if (effect.type === 0 && right - left < 16) {
        right = Math.min(edges.right - 4, Math.max(right, left + 16));
        left = Math.max(edges.left + 4, Math.min(left, right - 16));
      }
      if (right <= left) continue;
      const y = row * layout.rowHeight + layout.stringTop + a.string * layout.stringGap;
      const middle = (left + right) / 2, span = right - left;
      const item: PracticeTabEffect = {key: `${effect.id}:${row}`, kind, row, path: "", labelX: middle, labelY: y - 16};
      // The raised pitch is produced by bending, not by fretting that number.
      // Hide the target for a bend and the starting pitch for a pre-bend release.
      if (kind === "bend") item.hiddenFretKey = b.key;
      if (kind === "release") item.hiddenFretKey = a.key;
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
        // Use a bounded turn, then an explicit vertical shaft into the head.
        // Long time spans extend the hold, never flatten/stretch the bend curve.
        const shaftEndY = endY + (release ? -3 : 3);
        const startY = y - (release ? 14 : 1);
        const curveEndY = endY + (release ? -7 : 7);
        const turnStart = Math.max(left, right - 18);
        const transition = release ? row === b.row : row === a.row;
        item.held = !transition;
        item.path = transition ? `M${left} ${startY} H${turnStart} C${turnStart + (right-turnStart)*0.65} ${startY} ${right} ${startY} ${right} ${curveEndY} L${right} ${shaftEndY}`
          : `M${left} ${y - 14} H${right}`;
        // Optical correction: the incoming curve makes a geometrically centered
        // triangle appear right-heavy. Keep the shaft inside, but offset the head.
        const arrowX = right - 0.75;
        if (transition) item.arrow = release
          ? `M${arrowX - 3} ${endY - 5} L${arrowX} ${endY} L${arrowX + 3} ${endY - 5} Z`
          : `M${arrowX - 3} ${endY + 5} L${arrowX} ${endY} L${arrowX + 3} ${endY + 5} Z`;
        if (transition) item.label = bendAmount(Math.abs(delta));
        item.labelX = right;
        item.labelY = Math.max(row * layout.rowHeight + 10, y - 19);
      }
      result.push(item);
    }
  }
  for (const note of snapshot.notes) {
    if (!note.vibrato) continue;
    const fret = frets.get(`n:${note.id}`); if (!fret) continue;
    const linked = (snapshot.noteEffects ?? []).some(effect => effect.startNoteId === note.id || effect.endNoteId === note.id);
    for (let row = fret.row; row < layout.rowCount; row++) {
      const edges = bounds.get(row); if (!edges) continue;
      const {start,end} = edges;
      if (note.startTime + note.length <= start) break;
      let left = row === fret.row ? Math.max(edges.left + 4, fret.x - fret.label.length * 3.5) : edges.left + 4;
      const sustain = practiceTabPosition(layout, Math.min(note.startTime + note.length, end - 0.001));
      const right = Math.min(edges.right - 4, Math.max(left + 18, sustain.x));
      left = Math.min(left, right - 12);
      const y = row * layout.rowHeight + layout.stringTop + fret.string * layout.stringGap - (linked ? 21 : 10);
      const waves = Math.max(2, Math.round((right - left) / 7)), step = (right-left)/waves;
      let path = `M${left} ${y}`;
      for (let i = 0; i < waves; i++) path += `q${step/4} -3 ${step/2} 0t${step/2} 0`;
      result.push({key:`vibrato:${note.id}:${row}`,kind:"vibrato",row,path,labelX:0,labelY:0});
    }
  }
  return result;
}
