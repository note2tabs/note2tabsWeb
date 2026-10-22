import type { EditorSnapshot } from "../types/gte";
import { isNotationTrack } from "./gteNotation";

export function serializeNotationPayload(snapshot: Record<string, any>): Record<string, any> {
  if (Array.isArray(snapshot.editors)) return { ...snapshot, editors: snapshot.editors.map((lane: EditorSnapshot) => isNotationTrack(lane) ? serializeNotationSnapshot(lane) : lane) };
  return Array.isArray(snapshot.notes) && Array.isArray(snapshot.chords) && isNotationTrack(snapshot as EditorSnapshot) ? serializeNotationSnapshot(snapshot as EditorSnapshot) : snapshot;
}

/** The existing backend preserves chordEditor's JSON metadata but normalizes
 * unknown fields off notes. Keep this wire adapter separate from the music model. */
export function serializeNotationSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  const assignments = Object.fromEntries([
    ...snapshot.notes.map((note) => ["n:" + note.id, { voice: note.notationVoice ?? 1, staff: note.notationStaff }]),
    ...snapshot.chords.map((chord) => ["c:" + chord.id, { voice: chord.notationVoice ?? 1 }]),
  ]);
  return { ...snapshot, chordEditor: { ...snapshot.chordEditor, notation: { ...snapshot.notation, assignments } } };
}

export function restoreNotationSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  const stored = snapshot.chordEditor?.notation;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return snapshot;
  const data = stored as NonNullable<EditorSnapshot["notation"]> & { assignments?: Record<string, { voice?: number; staff?: string }> };
  const assignments = data.assignments ?? {};
  return { ...snapshot, notation: snapshot.notation ?? { rests: data.rests, ties: data.ties, slurs: data.slurs },
    notes: snapshot.notes.map((note) => {
      const entry = assignments["n:" + note.id];
      return { ...note, notationVoice: note.notationVoice ?? (entry?.voice === 2 ? 2 : 1),
        notationStaff: note.notationStaff ?? (entry?.staff === "treble" || entry?.staff === "bass" ? entry.staff : undefined) };
    }),
    chords: snapshot.chords.map((chord) => ({ ...chord, notationVoice: chord.notationVoice ?? (assignments["c:" + chord.id]?.voice === 2 ? 2 : 1) })),
  };
}
