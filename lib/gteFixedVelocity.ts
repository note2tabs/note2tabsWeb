import type { EditorSnapshot } from "../types/gte";

/** MIDI velocity is fixed product-wide; the editor model uses normalized 0–1. */
export const FIXED_NOTE_VELOCITY = 100 / 127;

export function withFixedVelocity(lane: EditorSnapshot): EditorSnapshot {
  const notes = lane.notes.map(note => note.velocity === FIXED_NOTE_VELOCITY ? note : { ...note, velocity: FIXED_NOTE_VELOCITY });
  const chords = lane.chords.map(chord => ({ ...chord, velocities: Array.from({ length: Math.max(chord.originalMidi?.length ?? 0, chord.currentTabs.length) }, () => FIXED_NOTE_VELOCITY) }));
  const stored = lane.chordEditor?.notation as { assignments?: Record<string, unknown> } | undefined;
  const assignments = stored?.assignments;
  return { ...lane, notes, chords, ...(assignments ? { chordEditor: { ...lane.chordEditor, notation: { ...stored,
    assignments: Object.fromEntries(Object.entries(assignments).map(([key, entry]) => [key, key.startsWith("n:") ? { ...(entry as object), velocity: FIXED_NOTE_VELOCITY } : entry])),
  } } } : {}) };
}
