import type { EditorSnapshot } from "../types/gte";
import { buildDrumNote, DRUM_VOICES, getDrumVoiceForNote } from "./gteDrums";
import { DRUM_NOTATION_POSITIONS } from "./gteDrumNotation";
import { normalizeDrumLoops } from "./gteDrumLoops";

export function insertDrumNotationHit(snapshot: EditorSnapshot, voiceIndex: number, frame: number) {
  let startTime = Math.max(0, Math.round(frame));
  const loop = normalizeDrumLoops(snapshot.drumLoops ?? [], snapshot.totalFrames).find(loop => startTime >= loop.sourceEnd && startTime < loop.loopEnd);
  // Repeated notation is a view of its editable source, not disposable hits.
  if (loop) startTime = loop.sourceStart + (startTime - loop.sourceStart) % (loop.sourceEnd - loop.sourceStart);
  const nextId = snapshot.notes.reduce((id, note) => Math.max(id, note.id + 1), 0);
  const note = buildDrumNote({ id: nextId, voiceIndex, startTime });
  if (snapshot.notes.some(existing => existing.startTime === startTime && getDrumVoiceForNote(existing).id === getDrumVoiceForNote(note).id)) return snapshot;
  const bar = snapshot.framesPerMessure || 480;
  return { ...snapshot, notes: [...snapshot.notes, note], totalFrames: Math.max(snapshot.totalFrames, Math.ceil((startTime + 1) / bar) * bar) };
}

export function moveDrumNotationHits(snapshot: EditorSnapshot, ids: number[], shift: number, transpose: number) {
  const chosen = new Set(ids);
  if (snapshot.notes.some(note => chosen.has(note.id) && note.startTime + shift < 0)) return snapshot;
  const notes = snapshot.notes.map(note => {
    if (!chosen.has(note.id)) return note;
    const voice = getDrumVoiceForNote(note);
    const target = DRUM_NOTATION_POSITIONS[voice.id].midi + transpose;
    const index = transpose === 0 ? DRUM_VOICES.findIndex(candidate => candidate.id === voice.id) : DRUM_VOICES.reduce((best, candidate, index) =>
      Math.abs(DRUM_NOTATION_POSITIONS[candidate.id].midi - target) < Math.abs(DRUM_NOTATION_POSITIONS[DRUM_VOICES[best].id].midi - target) ? index : best, 0);
    return { ...note, startTime: Math.max(0, Math.round(note.startTime + shift)), midiNum: DRUM_VOICES[index].midi, tab: [index, 0] as [number, number] };
  });
  const bar = snapshot.framesPerMessure || 480;
  const end = notes.reduce((last, note) => Math.max(last, note.startTime + 1), snapshot.totalFrames);
  return { ...snapshot, notes, totalFrames: Math.ceil(end / bar) * bar };
}
