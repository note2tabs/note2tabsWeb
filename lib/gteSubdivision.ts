import type { EditorSnapshot } from "../types/gte";
import { cloneEditorSnapshot, nextLocalChordId, nextLocalNoteId } from "./gteLocalEditorOps";

export const MAX_SUBDIVISION_PARTS = 128;
export type SubdivisionTarget = { kind: "note" | "chord"; id: number; cuts: number[] };

/** Strict temporal overlap, including transitive overlap; touching endpoints stay separate. */
export function buildSubdivisionPlan(snapshot: EditorSnapshot, noteIds: number[], chordIds: number[], parts: number): SubdivisionTarget[] {
  const count = Math.max(2, Math.min(MAX_SUBDIVISION_PARTS, Math.round(parts) || 2));
  const selectedNotes = new Set(noteIds), selectedChords = new Set(chordIds);
  const events = [
    ...snapshot.notes.filter((note) => selectedNotes.has(note.id)).map((note) => ({ kind: "note" as const, ...note })),
    ...snapshot.chords.filter((chord) => selectedChords.has(chord.id)).map((chord) => ({ kind: "chord" as const, ...chord })),
  ].filter((event) => Number.isFinite(event.startTime) && event.length > 0)
    .sort((a, b) => a.startTime - b.startTime || a.id - b.id);
  const groups: Array<{ start: number; end: number; events: typeof events }> = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && event.startTime < last.end) {
      last.events.push(event);
      last.end = Math.max(last.end, event.startTime + event.length);
    } else groups.push({ start: event.startTime, end: event.startTime + event.length, events: [event] });
  }
  return groups.flatMap((group) => {
    const cuts = [...new Set(Array.from({ length: count - 1 }, (_, i) => Math.round(group.start + (group.end - group.start) * (i + 1) / count)))];
    return group.events.map((event) => ({ kind: event.kind, id: event.id,
      cuts: cuts.filter((cut) => cut >= event.startTime + 1 && cut <= event.startTime + event.length - 1),
    }));
  });
}

/** One snapshot edit keeps subdivision atomic for undo and autosave. */
export function subdivideSelection(snapshot: EditorSnapshot, plan: SubdivisionTarget[]): EditorSnapshot {
  const next = cloneEditorSnapshot(snapshot);
  let noteId = nextLocalNoteId(next), chordId = nextLocalChordId(next);
  const targets = new Map(plan.map((target) => [`${target.kind}:${target.id}`, target]));
  const lastNoteIds = new Map<number, number>();
  const boundaries = (kind: string, id: number, start: number, length: number) =>
    [start, ...[...new Set(targets.get(`${kind}:${id}`)?.cuts ?? [])].filter((cut) => cut >= start + 1 && cut <= start + length - 1).sort((a, b) => a - b), start + length];
  next.notes = next.notes.flatMap((note) => {
    const times = boundaries("note", note.id, note.startTime, note.length);
    return times.slice(0, -1).map((start, i) => {
      const id = i === 0 ? note.id : noteId++;
      lastNoteIds.set(note.id, id);
      return { ...note, id, startTime: start, length: times[i + 1] - start };
    });
  });
  next.chords = next.chords.flatMap((chord) => {
    const times = boundaries("chord", chord.id, chord.startTime, chord.length);
    return times.slice(0, -1).map((start, i) => ({ ...chord, id: i === 0 ? chord.id : chordId++, startTime: start, length: times[i + 1] - start,
      ...(chord.strums ? { strums: chord.strums
        .filter((strum) => chord.startTime + strum.time >= start && chord.startTime + strum.time < times[i + 1])
        .map((strum) => ({ ...strum, time: chord.startTime + strum.time - start })) } : {}),
    }));
  });
  // Incoming effects stay on the first segment; outgoing effects follow the last.
  next.noteEffects = next.noteEffects?.map((effect) => ({ ...effect, startNoteId: effect.startNoteId === effect.endNoteId
    ? effect.startNoteId : lastNoteIds.get(effect.startNoteId) ?? effect.startNoteId }));
  return next;
}
