import type { CutWithCoord, EditorSnapshot, TabCoord } from "../types/gte";
import { cloneEditorSnapshot } from "./gteLocalEditorOps";
import { finalizeOptimizedTrackFingeringInSnapshot, mergeRedundantCutRegionsInSnapshot, optimizeTrackFingeringInSnapshot } from "./gteFingeringOptimization";
import { generatePlayingCoordinatesInSnapshot } from "./gtePlayingCoordinates";
import { getMaxFretFromSnapshot, getOpenStringMidiFromSnapshot, getTabMidi } from "./gteTuning";

export type OptimizeScope = "selected" | "track";
export type OptimizeOptions = { scope: OptimizeScope; position: "automatic" | "chosen"; fret: number; custom: boolean; cuts: CutWithCoord[] };
export type OptimizeSelection = { noteIds: number[]; chordIds: number[] };

export function optimizationRange(snapshot: EditorSnapshot, selection: OptimizeSelection, scope: OptimizeScope) {
  const notes = new Set(selection.noteIds), chords = new Set(selection.chordIds);
  const events = [...snapshot.notes.filter((note) => scope === "track" || notes.has(note.id)), ...snapshot.chords.filter((chord) => scope === "track" || chords.has(chord.id))];
  if (!events.length) return null;
  return { start: scope === "track" ? 0 : Math.min(...events.map((event) => event.startTime)),
    end: Math.max(scope === "track" ? snapshot.totalFrames : 0, ...events.map((event) => event.startTime + event.length)) };
}

export function optimizationAnchorString(snapshot: EditorSnapshot) {
  const strings = getOpenStringMidiFromSnapshot(snapshot);
  const g = strings.findIndex((midi) => midi % 12 === 7);
  return g >= 0 ? g : Math.min(2, strings.length - 1);
}

export function coordinateAt(cuts: CutWithCoord[], time: number, fallback: TabCoord): TabCoord {
  const cut = cuts.find(([[start, end]]) => start <= time && time < end);
  return cut ? [...cut[1]] : [...fallback];
}

/** Partition only the requested window; preserve coordinates everywhere outside it. */
export function replaceCoordinateWindow(original: CutWithCoord[], replacement: CutWithCoord[], start: number, end: number, total: number, fallback: TabCoord): CutWithCoord[] {
  const boundaries = [...new Set([0, total, start, end, ...original.flatMap(([range]) => range),
    ...replacement.flatMap(([range]) => range).filter((time) => time > start && time < end)])].filter((time) => time >= 0 && time <= total).sort((a, b) => a - b);
  return boundaries.slice(0, -1).flatMap((from, index): CutWithCoord[] => {
    const to = boundaries[index + 1];
    if (to <= from) return [];
    return [[[from, to], coordinateAt(from >= start && to <= end ? replacement : original, from, fallback)]];
  });
}

export function editableOptimizationCuts(snapshot: EditorSnapshot, selection: OptimizeSelection, scope: OptimizeScope, fret: number): CutWithCoord[] {
  const range = optimizationRange(snapshot, selection, scope);
  if (!range) return [];
  const fallback: TabCoord = [optimizationAnchorString(snapshot), fret];
  const cuts = replaceCoordinateWindow([], snapshot.cutPositionsWithCoords, range.start, range.end, Math.max(snapshot.totalFrames, range.end), fallback);
  return cuts.filter(([[start, end]]) => start >= range.start && end <= range.end);
}

/** A local-only crop for the original playing-coordinate workspace. */
export function createCoordinateEditorDraft(snapshot: EditorSnapshot, selection: OptimizeSelection, scope: OptimizeScope, cuts: CutWithCoord[]): EditorSnapshot | null {
  const range = optimizationRange(snapshot, selection, scope);
  if (!range) return null;
  const draft = cloneEditorSnapshot(snapshot);
  const crop = <T extends { startTime: number; length: number }>(events: T[]): T[] => events
    .filter((event) => event.startTime < range.end && event.startTime + event.length > range.start)
    .map((event) => ({ ...event, startTime: Math.max(range.start, event.startTime) - range.start,
      length: Math.min(range.end, event.startTime + event.length) - Math.max(range.start, event.startTime) }));
  draft.notes = crop(draft.notes); draft.chords = crop(draft.chords);
  draft.timelineOffsetFrames = 0;
  draft.totalFrames = range.end - range.start;
  draft.optimalsByTime = {};
  draft.cutPositionsWithCoords = replaceCoordinateWindow([], cuts, range.start, range.end, Math.max(snapshot.totalFrames, range.end), [optimizationAnchorString(snapshot), 0])
    .filter(([[start, end]]) => start >= range.start && end <= range.end)
    .map(([[start, end], coord]) => [[start - range.start, end - range.start], coord]);
  const ids = new Set(draft.notes.map((note) => note.id));
  draft.noteEffects = draft.noteEffects?.filter((effect) => ids.has(effect.startNoteId) && ids.has(effect.endNoteId));
  return draft;
}

export function coordinateEditorResult(draft: EditorSnapshot, start: number, end: number): CutWithCoord[] {
  const duration = end - start;
  const cuts = replaceCoordinateWindow([], draft.cutPositionsWithCoords, 0, duration, duration, [optimizationAnchorString(draft), 0]);
  return cuts.map(([[from, to], coord]) => [[from + start, to + start], coord]);
}

export function optimizeSelection(snapshot: EditorSnapshot, selection: OptimizeSelection, options: OptimizeOptions): EditorSnapshot {
  const range = optimizationRange(snapshot, selection, options.scope);
  if (!range) return cloneEditorSnapshot(snapshot);
  const maxFret = getMaxFretFromSnapshot(snapshot), stringCount = getOpenStringMidiFromSnapshot(snapshot).length;
  if (options.position === "chosen" && (!Number.isInteger(options.fret) || options.fret < 0 || options.fret > maxFret)) throw new Error("Choose a valid fret position.");
  const notes = new Set(selection.noteIds), chords = new Set(selection.chordIds);
  const whole = options.scope === "track";
  const working = cloneEditorSnapshot(snapshot);
  working.notes = working.notes.filter((note) => whole || notes.has(note.id));
  working.chords = working.chords.filter((chord) => whole || chords.has(chord.id));
  working.noteEffects = working.noteEffects?.filter((effect) => whole || (notes.has(effect.startNoteId) && notes.has(effect.endNoteId)));
  const fallback: TabCoord = [optimizationAnchorString(snapshot), options.fret];
  let cuts: CutWithCoord[];
  if (options.position === "automatic") {
    const coordinateDraft = cloneEditorSnapshot(working);
    let id = -1000000;
    working.chords.forEach((chord) => chord.currentTabs.forEach((tab) => coordinateDraft.notes.push({ id: id--, startTime: chord.startTime, length: chord.length, tab: [...tab], midiNum: getTabMidi(working, tab), optimals: [] })));
    generatePlayingCoordinatesInSnapshot(coordinateDraft);
    cuts = coordinateDraft.cutPositionsWithCoords;
  } else if (options.custom) {
    if (!options.cuts.length || options.cuts.some(([[start, end], [string, fret]]) => !Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isInteger(string) || string < 0 || string >= stringCount || !Number.isInteger(fret) || fret < 0 || fret > maxFret)) throw new Error("Check the custom fret positions.");
    const ordered = [...options.cuts].sort((a, b) => a[0][0] - b[0][0]);
    if (ordered[0][0][0] !== range.start || ordered[ordered.length - 1][0][1] !== range.end || ordered.some((cut, i) => i > 0 && cut[0][0] !== ordered[i - 1][0][1])) throw new Error("Custom fret positions must cover the selected range without gaps.");
    cuts = ordered;
  } else cuts = [[[range.start, range.end], fallback]];
  const total = Math.max(snapshot.totalFrames, range.end);
  working.cutPositionsWithCoords = replaceCoordinateWindow(snapshot.cutPositionsWithCoords, cuts, range.start, range.end, total, fallback);
  optimizeTrackFingeringInSnapshot(working);
  finalizeOptimizedTrackFingeringInSnapshot(working);
  mergeRedundantCutRegionsInSnapshot(working);
  if (whole) return working;

  const next = cloneEditorSnapshot(snapshot);
  const untouchedNotes = next.notes.filter((note) => !notes.has(note.id)), untouchedChords = next.chords.filter((chord) => !chords.has(chord.id));
  const occupiedNotes = new Set(untouchedNotes.map((note) => note.id)), occupiedChords = new Set(untouchedChords.map((chord) => chord.id));
  let noteId = Math.max(0, ...snapshot.notes.map((note) => note.id), ...working.notes.map((note) => note.id)) + 1;
  let chordId = Math.max(0, ...snapshot.chords.map((chord) => chord.id), ...working.chords.map((chord) => chord.id)) + 1;
  const remappedNotes = new Map<number, number>();
  working.notes.forEach((note) => { if (occupiedNotes.has(note.id)) { const old = note.id; note.id = noteId++; remappedNotes.set(old, note.id); } });
  working.chords.forEach((chord) => { if (occupiedChords.has(chord.id)) chord.id = chordId++; });
  next.notes = [...untouchedNotes, ...working.notes]; next.chords = [...untouchedChords, ...working.chords];
  const byId = new Map(next.notes.map((note) => [note.id, note]));
  const originalEffects = (next.noteEffects || []).filter((effect) => {
    if (notes.has(effect.startNoteId) && notes.has(effect.endNoteId)) return false;
    if (!notes.has(effect.startNoteId) && !notes.has(effect.endNoteId)) return true;
    const first = byId.get(effect.startNoteId), second = byId.get(effect.endNoteId);
    return first && second && first.tab[0] === second.tab[0];
  });
  next.noteEffects = [...originalEffects, ...(working.noteEffects || []).map((effect) => ({ ...effect, startNoteId: remappedNotes.get(effect.startNoteId) ?? effect.startNoteId, endNoteId: remappedNotes.get(effect.endNoteId) ?? effect.endNoteId }))];
  next.cutPositionsWithCoords = replaceCoordinateWindow(snapshot.cutPositionsWithCoords, working.cutPositionsWithCoords, range.start, range.end, total, fallback);
  return next;
}
