import type { CutWithCoord, EditorSnapshot } from "../types/gte";
import { cloneEditorSnapshot } from "./gteLocalEditorOps";
import { finalizeOptimizedTrackFingeringInSnapshot, optimizeTrackFingeringInSnapshot } from "./gteFingeringOptimization";
import { coordinateAt, optimizationAnchorString, type OptimizeSelection } from "./gteOptimization";

/** One immutable source per open preview. Never optimize already-optimized pitches. */
export function createCoordinatePreview(source: EditorSnapshot, selection?: OptimizeSelection) {
  const baseline = cloneEditorSnapshot(source);
  const noteIds = new Set(selection?.noteIds ?? baseline.notes.map((note) => note.id));
  const chordIds = new Set(selection?.chordIds ?? baseline.chords.map((chord) => chord.id));
  const notes = baseline.notes.filter((note) => noteIds.has(note.id));
  const chords = baseline.chords.filter((chord) => chordIds.has(chord.id));
  const effects = (baseline.noteEffects ?? []).filter((effect) => noteIds.has(effect.startNoteId) && noteIds.has(effect.endNoteId));
  const notesById = new Map(notes.map((note) => [note.id, note]));
  // Overlaps and effect chains are dependencies, not independent cache entries.
  const intervals = [...notes, ...chords].map((event) => ({ start: Math.round(event.startTime), end: Math.round(event.startTime) + Math.max(1, Math.round(event.length)) }));
  effects.forEach((effect) => {
    const a = notesById.get(effect.startNoteId), b = notesById.get(effect.endNoteId);
    if (a && b) intervals.push({ start: Math.min(a.startTime, b.startTime), end: Math.max(a.startTime + a.length, b.startTime + b.length) });
  });
  intervals.sort((a, b) => a.start - b.start);
  const ranges: Array<{ start: number; end: number }> = [];
  intervals.forEach((interval) => {
    const last = ranges[ranges.length - 1];
    if (last && interval.start < last.end) last.end = Math.max(last.end, interval.end);
    else ranges.push({ ...interval });
  });
  const stride = baseline.notes.length + baseline.chords.length + 1;
  const maxNoteId = Math.max(0, ...baseline.notes.map((note) => note.id));
  const maxChordId = Math.max(0, ...baseline.chords.map((chord) => chord.id));
  const groups = ranges.map((range) => {
    const groupNotes = notes.filter((note) => note.startTime >= range.start && note.startTime < range.end);
    const groupChords = chords.filter((chord) => chord.startTime >= range.start && chord.startTime < range.end);
    const ids = new Set(groupNotes.map((note) => note.id));
    return { notes: groupNotes, chords: groupChords, effects: effects.filter((effect) => ids.has(effect.startNoteId) && ids.has(effect.endNoteId)),
      times: [...new Set([...groupNotes, ...groupChords].map((event) => Math.round(event.startTime)))], key: "", result: null as EditorSnapshot | null };
  });
  return {
    update(cuts: CutWithCoord[]) {
      let recomputedGroups = 0;
      const fallback: [number, number] = [optimizationAnchorString(baseline), 0];
      groups.forEach((group, index) => {
        const key = JSON.stringify(group.times.map((time) => coordinateAt(cuts, time, fallback)));
        if (group.result && key === group.key) return;
        const draft = cloneEditorSnapshot({ ...baseline, notes: group.notes, chords: group.chords, noteEffects: group.effects, cutPositionsWithCoords: cuts });
        optimizeTrackFingeringInSnapshot(draft);
        finalizeOptimizedTrackFingeringInSnapshot(draft);
        // Reserve deterministic IDs across independent groups, including converted chords.
        let nextNote = maxNoteId + index * stride + 1, nextChord = maxChordId + index * stride + 1;
        const originalNotes = new Set(group.notes.map((note) => note.id)), originalChords = new Set(group.chords.map((chord) => chord.id));
        draft.notes.forEach((note) => { if (!originalNotes.has(note.id)) note.id = nextNote++; });
        draft.chords.forEach((chord) => { if (!originalChords.has(chord.id)) chord.id = nextChord++; });
        group.key = key; group.result = draft; recomputedGroups += 1;
      });
      const untouchedEffects = (baseline.noteEffects ?? []).filter((effect) => !noteIds.has(effect.startNoteId) || !noteIds.has(effect.endNoteId));
      const snapshot: EditorSnapshot = { ...baseline, cutPositionsWithCoords: structuredClone(cuts),
        notes: [...baseline.notes.filter((note) => !noteIds.has(note.id)), ...groups.flatMap((group) => group.result!.notes)],
        chords: [...baseline.chords.filter((chord) => !chordIds.has(chord.id)), ...groups.flatMap((group) => group.result!.chords)],
        noteEffects: [...untouchedEffects, ...groups.flatMap((group) => group.result!.noteEffects ?? [])] };
      const resultNotes = new Map(snapshot.notes.map((note) => [note.id, note]));
      snapshot.noteEffects = snapshot.noteEffects?.filter((effect) => {
        if (noteIds.has(effect.startNoteId) === noteIds.has(effect.endNoteId)) return true;
        const a = resultNotes.get(effect.startNoteId), b = resultNotes.get(effect.endNoteId);
        return a && b && a.tab[0] === b.tab[0];
      });
      // Cached objects must never be mutated by the embedded editor.
      return { snapshot: cloneEditorSnapshot(snapshot), recomputedGroups, totalGroups: groups.length };
    },
  };
}
