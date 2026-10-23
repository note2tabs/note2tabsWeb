import type { EditorSnapshot } from "../types/gte";
import { isNotationTrack } from "./gteNotation";
import { getTrackInstrumentType } from "./gteInstrumentType";

export function serializeNotationPayload(snapshot: Record<string, any>): Record<string, any> {
  const serialize = (lane: EditorSnapshot) => {
    const next = isNotationTrack(lane) || lane.notation !== undefined ? serializeNotationSnapshot(lane) : lane;
    const type = getTrackInstrumentType(lane);
    // The legacy backend infers bass from sound IDs. Keep its transport sound
    // aligned with representation; the actual independent sound lives in metadata.
    const pitched = type === "notation" || type === "guitar-tab";
    const neutralName = pitched && /\bbass\b/i.test(lane.name ?? "") && !/\bbassoon\b/i.test(lane.name ?? "");
    const bassProgram = pitched && lane.program !== undefined && lane.program >= 32 && lane.program <= 39;
    return { ...next, ...(neutralName ? { name: "Track" } : {}), ...(bassProgram ? { program: type === "notation" ? 0 : 24 } : {}),
      instrumentId: type === "notation" ? "gm:piano" : type === "guitar-tab" ? "acoustic" : next.instrumentId,
      chordEditor: { ...next.chordEditor, instrumentType: type, instrumentSound: lane.instrumentId,
        ...(neutralName ? { instrumentDisplayName: lane.name } : {}), ...(pitched ? { instrumentProgram: lane.program } : {}) } };
  };
  if (Array.isArray(snapshot.editors)) return { ...snapshot, editors: snapshot.editors.map(serialize) };
  return Array.isArray(snapshot.notes) && Array.isArray(snapshot.chords) ? serialize(snapshot as EditorSnapshot) : snapshot;
}

/** The existing backend preserves chordEditor's JSON metadata but normalizes
 * unknown fields off notes. Keep this wire adapter separate from the music model. */
export function serializeNotationSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  const assignments = Object.fromEntries([
    ...snapshot.notes.map((note) => ["n:" + note.id, { voice: note.notationVoice ?? 1, staff: note.notationStaff,
      midi: note.midiNum, velocity: note.velocity, pitchBend: note.pitchBend, start: note.startTime, length: note.length }]),
    ...snapshot.chords.map((chord) => ["c:" + chord.id, { voice: chord.notationVoice ?? 1, midis: chord.originalMidi }]),
  ]);
  return { ...snapshot, chordEditor: { ...snapshot.chordEditor, notation: { ...snapshot.notation, assignments } } };
}

export function restoreNotationSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  if (!snapshot.instrumentType && snapshot.chordEditor?.instrumentType) {
    snapshot = { ...snapshot, instrumentType: getTrackInstrumentType(snapshot), instrumentId: typeof snapshot.chordEditor.instrumentSound === "string" ? snapshot.chordEditor.instrumentSound : snapshot.instrumentId,
      ...(snapshot.name === "Track" && typeof snapshot.chordEditor.instrumentDisplayName === "string" ? { name: snapshot.chordEditor.instrumentDisplayName } : {}),
      ...(typeof snapshot.chordEditor.instrumentProgram === "number" ? { program: snapshot.chordEditor.instrumentProgram } : {}) };
  }
  // Already decoded snapshots are the live editing model. Never overwrite a
  // fresh local edit with the previous save's transport metadata.
  if (snapshot.notation !== undefined) return snapshot;
  const stored = snapshot.chordEditor?.notation;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return snapshot;
  const data = stored as NonNullable<EditorSnapshot["notation"]> & { assignments?: Record<string, { voice?: number; staff?: string; velocity?: number; pitchBend?: number[]; start?: number; length?: number; midi?: number; midis?: number[] }> };
  const assignments = data.assignments ?? {};
  const pitched = isNotationTrack(snapshot);
  return { ...snapshot, notation: snapshot.notation ?? { rests: data.rests, ties: data.ties, slurs: data.slurs },
    notes: snapshot.notes.map((note) => {
      const entry = assignments["n:" + note.id];
      return { ...note, notationVoice: note.notationVoice ?? (entry?.voice === 2 ? 2 : 1),
        ...(pitched && Number.isFinite(entry?.midi) ? { midiNum: entry!.midi! } : {}),
        ...(Number.isFinite(entry?.velocity) ? { velocity: entry!.velocity } : {}),
        ...(Array.isArray(entry?.pitchBend) ? { pitchBend: entry.pitchBend } : {}),
        ...(pitched && Number.isFinite(entry?.start) && entry!.start! >= 0 ? { startTime: entry!.start! } : {}),
        ...(pitched && Number.isFinite(entry?.length) && entry!.length! > 0 ? { length: entry!.length! } : {}),
        notationStaff: note.notationStaff ?? (entry?.staff === "treble" || entry?.staff === "bass" ? entry.staff : undefined) };
    }),
    chords: snapshot.chords.map((chord) => ({ ...chord, originalMidi: pitched ? assignments["c:" + chord.id]?.midis ?? chord.originalMidi : chord.originalMidi, notationVoice: chord.notationVoice ?? (assignments["c:" + chord.id]?.voice === 2 ? 2 : 1) })),
  };
}
