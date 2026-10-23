import type { Chord, EditorSnapshot, Note } from "../types/gte";
import { getTabMidi } from "./gteTuning";
import { getTrackInstrumentType } from "./gteInstrumentType";

/** Sound determines the pitched editor without introducing a new persisted track schema. */
export function isNotationTrack(snapshot: Parameters<typeof getTrackInstrumentType>[0]) {
  return getTrackInstrumentType(snapshot) === "notation";
}

export type ScoreEvent = { key: string; noteId?: number; chordId?: number; member: number; midi: number; start: number; length: number; velocity: number; pitchBend?: number[]; staff: "treble" | "bass"; voice?: 1 | 2 };
export function scoreEvents(snapshot: EditorSnapshot): ScoreEvent[] {
  return [
    ...snapshot.notes.map((note) => ({
      key: "n:" + note.id, noteId: note.id, member: 0,
      voice: note.notationVoice ?? 1,
      pitchBend: note.pitchBend,
      midi: Number.isFinite(note.midiNum) ? note.midiNum : getTabMidi(snapshot, note.tab),
      start: note.startTime, length: note.length, velocity: note.velocity ?? 1, staff: note.notationStaff ?? (note.midiNum < 60 ? "bass" as const : "treble" as const),
    })),
    ...snapshot.chords.flatMap((chord) => {
      const count = Math.max(chord.originalMidi?.length ?? 0, chord.currentTabs.length);
      return Array.from({ length: count }, (_, member) => ({
        key: "c:" + chord.id + ":" + member, chordId: chord.id, member,
        voice: chord.notationVoice ?? 1,
        pitchBend: chord.pitchBends?.[member],
        midi: Number.isFinite(chord.originalMidi?.[member]) ? chord.originalMidi[member] : getTabMidi(snapshot, chord.currentTabs[member]),
        start: chord.startTime, length: chord.length, velocity: chord.velocities?.[member] ?? 1,
        staff: (chord.originalMidi[member] ?? getTabMidi(snapshot, chord.currentTabs[member])) < 60 ? "bass" as const : "treble" as const,
      }));
    }),
  ].filter((event) => Number.isFinite(event.midi) && event.midi >= 0 && event.midi <= 127 && event.length > 0);
}

const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
export function spellPitch(midi: number) {
  const pitch = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(pitch / 12) - 1, pc = pitch % 12;
  let letter = NATURALS.findIndex((value) => value === pc);
  const sharp = letter < 0;
  if (sharp) letter = NATURALS.findIndex((value) => value === pc - 1);
  return { step: (octave + 1) * 7 + letter, sharp, name: LETTERS[letter] + (sharp ? "♯" : "") + octave };
}
export function midiAtStep(step: number) {
  const safe = Math.max(0, Math.min(74, Math.round(step)));
  return Math.min(127, Math.floor(safe / 7) * 12 + NATURALS[safe % 7]);
}
export function wholeNoteFrames(snapshot: EditorSnapshot) {
  return snapshot.framesPerMessure * (snapshot.timeSignatureBottom || 4) / Math.max(1, snapshot.timeSignature || 4);
}
export function durationFrames(snapshot: EditorSnapshot, denominator: number) {
  return Math.max(1, wholeNoteFrames(snapshot) / denominator);
}

const KEY_INTERVALS = [
  [0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 8, 11],
  [0, 2, 3, 5, 7, 9, 11], [0, 2, 3, 5, 7, 9, 10], [0, 1, 3, 5, 7, 8, 10],
  [0, 2, 4, 6, 7, 9, 11], [0, 2, 4, 5, 7, 9, 10], [0, 2, 3, 4, 7, 9], [0, 3, 5, 6, 7, 10],
];
export function snapScorePitch(midi: number, root = 0, type = 0) {
  const intervals = KEY_INTERVALS[type] ?? KEY_INTERVALS[0];
  for (let delta = 0; delta <= 12; delta++) for (const candidate of [midi - delta, midi + delta]) {
    if (candidate >= 0 && candidate <= 127 && intervals.includes(((candidate - root) % 12 + 12) % 12)) return candidate;
  }
  return midi;
}
/** Letter entry follows the nearest octave, as opposed to a fixed octave field. */
export function nearestScorePitch(pitchClass: number, reference: number) {
  const candidates = Array.from({ length: 11 }, (_, octave) => octave * 12 + pitchClass).filter((midi) => midi >= 0 && midi <= 127);
  return candidates.sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference) || b - a)[0];
}

type Selection = { noteIds: readonly number[]; chordIds: readonly number[] };
export function validNotationTie(from: ScoreEvent, to: ScoreEvent) {
  return from.key !== to.key && from.midi === to.midi && from.staff === to.staff && (from.voice ?? 1) === (to.voice ?? 1) &&
    Math.abs(from.start + from.length - to.start) < 0.01;
}
/** Keep linked notes independently editable; only playback coalesces valid chains. */
export function scorePlaybackEvents(snapshot: EditorSnapshot) {
  const events = scoreEvents(snapshot), byKey = new Map(events.map((event) => [event.key, event]));
  const links = new Map<string, string>(), incoming = new Set<string>();
  for (const link of snapshot.notation?.ties ?? []) {
    const from = byKey.get(link.from), to = byKey.get(link.to);
    if (from && to && validNotationTie(from, to) && !links.has(from.key) && !incoming.has(to.key)) { links.set(from.key, to.key); incoming.add(to.key); }
  }
  return events.filter((event) => !incoming.has(event.key)).map((event) => {
    let tail = event;
    const visited = new Set([event.key]);
    while (links.has(tail.key)) {
      const next = byKey.get(links.get(tail.key)!)!;
      if (visited.has(next.key)) break;
      visited.add(next.key); tail = next;
    }
    return { ...event, length: tail.start + tail.length - event.start };
  });
}
export function toggleScoreConnection(source: EditorSnapshot, selection: Selection, kind: "ties" | "slurs") {
  const events = scoreEvents(source).filter((event) => event.noteId !== undefined ? selection.noteIds.includes(event.noteId) : selection.chordIds.includes(event.chordId!))
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
  const selected = new Set(events.map((event) => event.key));
  const existing = source.notation?.[kind] ?? [];
  if (existing.some((link) => selected.has(link.from) && selected.has(link.to))) {
    return { ...source, notation: { ...source.notation, [kind]: existing.filter((link) => !selected.has(link.from) || !selected.has(link.to)) } };
  }
  const links: Array<{ from: string; to: string }> = [];
  if (kind === "ties") events.forEach((from) => {
    const to = events.find((candidate) => validNotationTie(from, candidate));
    if (to) links.push({ from: from.key, to: to.key });
  });
  else if (events.length > 1 && events[0].start < events[events.length - 1].start) links.push({ from: events[0].key, to: events[events.length - 1].key });
  if (!links.length) return source;
  return { ...source, notation: { ...source.notation, [kind]: [...existing, ...links] } };
}
export function setScoreVoice(source: EditorSnapshot, selection: Selection, voice: 1 | 2) {
  return { ...source, notes: source.notes.map((note) => selection.noteIds.includes(note.id) ? { ...note, notationVoice: voice } : note),
    chords: source.chords.map((chord) => selection.chordIds.includes(chord.id) ? { ...chord, notationVoice: voice } : chord) };
}
export function addScoreRest(source: EditorSnapshot, rest: NonNullable<NonNullable<EditorSnapshot["notation"]>["rests"]>[number]) {
  const rests = source.notation?.rests ?? [];
  return { ...source, totalFrames: Math.max(source.totalFrames, rest.start + rest.length), notation: { ...source.notation,
    rests: [...rests.filter((item) => item.staff !== rest.staff || item.voice !== rest.voice || item.start + item.length <= rest.start || item.start >= rest.start + rest.length), rest] } };
}
export function editScoreSelection(source: EditorSnapshot, selection: Selection, change: { transpose?: number; shift?: number; length?: number; remove?: boolean }) {
  const next = structuredClone(source), notes = new Set(selection.noteIds), chords = new Set(selection.chordIds);
  // Reject the entire move at MIDI/time bounds, preserving intervals and relative timing.
  const targets = scoreEvents(source).filter((event) => event.noteId !== undefined ? notes.has(event.noteId) : chords.has(event.chordId!));
  if (targets.some((event) => event.midi + (change.transpose ?? 0) < 0 || event.midi + (change.transpose ?? 0) > 127 || event.start + (change.shift ?? 0) < 0)) return source;
  if (change.remove) {
    next.notes = next.notes.filter((note) => !notes.has(note.id));
    next.chords = next.chords.filter((chord) => !chords.has(chord.id));
    next.noteEffects = next.noteEffects?.filter((effect) => !notes.has(effect.startNoteId) && !notes.has(effect.endNoteId));
  } else {
    const timing = (event: Note | Chord) => {
      event.startTime += change.shift ?? 0;
      if (change.length !== undefined) event.length = Math.max(1, Math.round(change.length));
    };
    next.notes.forEach((note) => { if (notes.has(note.id)) {
      timing(note);
      if (change.transpose) { note.midiNum = (Number.isFinite(note.midiNum) ? note.midiNum : getTabMidi(source, note.tab)) + change.transpose; note.optimals = []; }
    } });
    next.chords.forEach((chord) => { if (chords.has(chord.id)) {
      const previousStart = chord.startTime;
      timing(chord);
      chord.strums = chord.strums?.map((strum) => ({ ...strum, time: strum.time + chord.startTime - previousStart })).filter((strum) => strum.time < chord.startTime + chord.length);
      if (change.transpose) {
        chord.originalMidi = Array.from({ length: Math.max(chord.originalMidi.length, chord.currentTabs.length) }, (_, index) => (chord.originalMidi[index] ?? getTabMidi(source, chord.currentTabs[index])) + change.transpose!);
        delete chord.fingering;
      }
    } });
  }
  next.totalFrames = Math.max(next.totalFrames, ...next.notes.map((note) => note.startTime + note.length), ...next.chords.map((chord) => chord.startTime + chord.length));
  if (next.notation) {
    const events = new Map(scoreEvents(next).map((event) => [event.key, event]));
    next.notation.ties = next.notation.ties?.filter((link) => {
      const from = events.get(link.from), to = events.get(link.to);
      return from && to && validNotationTie(from, to);
    });
    next.notation.slurs = next.notation.slurs?.filter((link) => events.has(link.from) && events.has(link.to));
  }
  return next;
}
export function addScoreNote(source: EditorSnapshot, midi: number, start: number, length: number, staff?: "treble" | "bass", voice: 1 | 2 = 1) {
  const next = structuredClone(source);
  const id = Math.max(0, ...source.notes.map((note) => note.id)) + 1;
  // Keep compatibility coordinates for the existing schema; MIDI is authoritative for pitched tracks.
  const note: Note = { id, midiNum: Math.max(0, Math.min(127, Math.round(midi))), startTime: Math.max(0, start), length: Math.max(1, length), tab: [0, 0], optimals: [] };
  if (staff) note.notationStaff = staff;
  note.notationVoice = voice;
  if (next.notation?.rests) next.notation.rests = next.notation.rests.filter((rest) => rest.staff !== (staff ?? (midi < 60 ? "bass" : "treble")) || rest.voice !== voice || rest.start + rest.length <= note.startTime || rest.start >= note.startTime + note.length);
  next.notes.push(note);
  next.totalFrames = Math.max(next.totalFrames, note.startTime + note.length);
  return { snapshot: next, note };
}
