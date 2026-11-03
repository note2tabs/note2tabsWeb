import type { EditorSnapshot } from "../types/gte";

export function setNoteVibrato(snapshot: EditorSnapshot, ids: number[], enabled: boolean) {
  const selected = new Set(ids);
  snapshot.notes = snapshot.notes.map(note => selected.has(note.id) ? {...note, vibrato: enabled} : note);
}

/** Use the existing extensible lane metadata so older APIs keep this articulation. */
export function serializeVibrato(snapshot: EditorSnapshot): EditorSnapshot {
  if (!snapshot.notes.some(note => note.vibrato) && snapshot.chordEditor?.noteVibrato === undefined) return snapshot;
  return {...snapshot, chordEditor: {...snapshot.chordEditor,
    noteVibrato: snapshot.notes.filter(note => note.vibrato).map(note => note.id),
  }};
}

export function restoreVibrato(snapshot: EditorSnapshot): EditorSnapshot {
  const stored = snapshot.chordEditor?.noteVibrato;
  if (!Array.isArray(stored) || !stored.length) return snapshot;
  const ids = new Set(stored.filter(id => typeof id === 'number'));
  return {...snapshot, notes: snapshot.notes.map(note => note.vibrato === undefined && ids.has(note.id) ? {...note,vibrato:true} : note)};
}
