import type { EditorSnapshot, Note } from "../types/gte";
import { addScoreNote, scoreEvents, validNotationTie, type ScoreEvent } from "./gteNotation";

export type MidiEdit = { shift?: number; transpose?: number; lengthDelta?: number; velocity?: number; voice?: 1 | 2; remove?: boolean };
export const midiPitchName = (midi: number) => ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][midi % 12] + (Math.floor(midi / 12) - 1);
export function midiGridFrames(snapshot: EditorSnapshot, denominator: number) {
  return snapshot.framesPerMessure * (snapshot.timeSignatureBottom || 4) / (snapshot.timeSignature || 4) / denominator;
}
export function snapMidiFrame(frame: number, grid: number) { return Math.max(0, Math.round(frame / grid) * grid); }

/** MIDI edits address individual pitches, including members of imported chords.
 * Only affected chords are expanded; their other members and phrasing survive. */
export function editMidiEvents(source: EditorSnapshot, keys: readonly string[], change: MidiEdit): EditorSnapshot {
  const selected = new Set(keys), events = scoreEvents(source), targets = events.filter((event) => selected.has(event.key));
  if (!targets.length || targets.some((event) => event.start + (change.shift ?? 0) < 0 || event.midi + (change.transpose ?? 0) < 0 || event.midi + (change.transpose ?? 0) > 127 || event.length + (change.lengthDelta ?? 0) <= 0)) return source;
  const next = structuredClone(source), remap = new Map<string, string>();
  let id = Math.max(0, ...source.notes.map((note) => note.id));
  const affected = new Set(targets.flatMap((event) => event.chordId !== undefined ? [event.chordId] : []));
  for (const chord of source.chords.filter((chord) => affected.has(chord.id))) {
    for (const event of events.filter((event) => event.chordId === chord.id)) {
      const note: Note = { id: ++id, midiNum: event.midi, startTime: event.start, length: event.length, velocity: event.velocity,
        pitchBend: chord.pitchBends?.[event.member], notationVoice: event.voice ?? 1, notationStaff: event.staff, tab: [0, 0], optimals: [] };
      remap.set(event.key, "n:" + note.id); next.notes.push(note);
    }
  }
  next.chords = next.chords.filter((chord) => !affected.has(chord.id));
  const chosen = new Set(keys.map((key) => remap.get(key) ?? key));
  next.notes = next.notes.flatMap((note) => {
    if (!chosen.has("n:" + note.id)) return [note];
    if (change.remove) return [];
    return [{ ...note, startTime: note.startTime + (change.shift ?? 0), length: note.length + (change.lengthDelta ?? 0),
      midiNum: note.midiNum + (change.transpose ?? 0), optimals: change.transpose ? [] : note.optimals,
      notationVoice: change.voice ?? note.notationVoice,
      velocity: change.velocity === undefined ? note.velocity : Math.max(1 / 127, Math.min(1, change.velocity)) }];
  });
  const current = scoreEvents(next), byKey = new Map(current.map((event) => [event.key, event]));
  if (next.notation) {
    for (const kind of ["ties", "slurs"] as const) next.notation[kind] = next.notation[kind]?.flatMap((link) => {
      const from = remap.get(link.from) ?? link.from, to = remap.get(link.to) ?? link.to;
      const a = byKey.get(from), b = byKey.get(to);
      return a && b && (kind === "slurs" || validNotationTie(a, b)) ? [{ from, to }] : [];
    });
    next.notation.rests = next.notation.rests?.filter((rest) => !current.some((event) => event.staff === rest.staff && (event.voice ?? 1) === rest.voice && event.start < rest.start + rest.length && event.start + event.length > rest.start));
  }
  next.totalFrames = Math.max(next.totalFrames, ...current.map((event) => event.start + event.length));
  return next;
}

export function pasteMidiEvents(source: EditorSnapshot, events: readonly ScoreEvent[], frame: number) {
  if (!events.length) return { snapshot: source, keys: [] as string[] };
  const origin = Math.min(...events.map((event) => event.start)), keys: string[] = [];
  let snapshot = source;
  for (const event of events) {
    const result = addScoreNote(snapshot, event.midi, Math.max(0, frame) + event.start - origin, event.length, event.staff, event.voice ?? 1);
    result.note.velocity = event.velocity;
    result.note.pitchBend = event.pitchBend?.slice();
    snapshot = result.snapshot; keys.push("n:" + result.note.id);
  }
  return { snapshot, keys };
}
