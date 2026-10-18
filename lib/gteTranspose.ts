import type { EditorSnapshot } from "../types/gte";
import { cloneEditorSnapshot } from "./gteLocalEditorOps";
import { getTabMidi } from "./gteTuning";

export function getTransposeBounds(snapshot: EditorSnapshot, noteIds: number[], chordIds: number[], maxFret: number) {
  const notes = new Set(noteIds), chords = new Set(chordIds);
  const frets = [
    ...snapshot.notes.filter((note) => notes.has(note.id)).map((note) => note.tab[1]),
    ...snapshot.chords.filter((chord) => chords.has(chord.id)).flatMap((chord) => chord.currentTabs.map((tab) => tab[1])),
  ];
  if (!frets.length) return null;
  return { min: -Math.min(...frets), max: maxFret - Math.max(...frets) };
}

/** Shift the selection uniformly without changing strings, timing or unselected content. */
export function transposeSelectionFrets(snapshot: EditorSnapshot, noteIds: number[], chordIds: number[], offset: number, maxFret: number): EditorSnapshot | null {
  const bounds = getTransposeBounds(snapshot, noteIds, chordIds, maxFret);
  if (!bounds || !Number.isInteger(offset) || offset < bounds.min || offset > bounds.max) return null;
  const next = cloneEditorSnapshot(snapshot);
  if (offset === 0) return next;
  const notes = new Set(noteIds), chords = new Set(chordIds);
  next.notes.forEach((note) => {
    if (!notes.has(note.id)) return;
    note.tab[1] += offset;
    note.midiNum = getTabMidi(next, note.tab, note.midiNum + offset);
    note.optimals = [];
  });
  next.chords.forEach((chord) => {
    if (!chords.has(chord.id)) return;
    chord.currentTabs = chord.currentTabs.map(([string, fret]) => [string, fret + offset]);
    delete chord.fingering;
    delete chord.fingeringIndex;
  });
  return next;
}
