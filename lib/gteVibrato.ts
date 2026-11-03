import type { EditorSnapshot, Note } from "../types/gte";

export const DEFAULT_VIBRATO = { cover: 2, bend: 0.5, cyclesPerBeat: 6 };
export const VIBRATO_COVER_OPTIONS = Array.from({length:32}, (_, index) => ({value:String(index + 1),label:index === 0 ? "1" : `1/${index + 1}`}));
export function vibratoBendOptions(current: number) {
  const values = [0.125,0.25,0.5,0.75,1,1.5,2];
  if (!values.includes(current)) values.push(current);
  return values.sort((a,b)=>a-b).map(value => {
    let numerator = Math.round(value * 10000), denominator = 10000;
    const gcd = (a:number,b:number):number => b ? gcd(b,a%b) : a;
    const divisor = gcd(numerator,denominator); numerator /= divisor; denominator /= divisor;
    return {value:String(value),label:denominator === 1 ? String(numerator) : `${numerator}/${denominator}`};
  });
}
export function vibratoSettings(note: Pick<Note, "vibratoSettings">) {
  const value = note.vibratoSettings;
  const safe = (n: unknown, fallback: number, min: number, max: number) => typeof n === "number" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  return { cover: Math.round(safe(value?.cover, DEFAULT_VIBRATO.cover, 1, 32)), bend: safe(value?.bend, DEFAULT_VIBRATO.bend, 0.01, 2), cyclesPerBeat: safe(value?.cyclesPerBeat, DEFAULT_VIBRATO.cyclesPerBeat, 0.05, 30) };
}

export type PlaybackVibrato = { start: number; end: number; phase: number; frequency: number; cents: number };
/** Clip against seeking/loops, retaining the original note's modulation phase. */
export function playbackVibrato(notes: Note[], start: number, end: number, secondsBetween: (a: number, b: number) => number, beatFrames: number): PlaybackVibrato[] {
  return notes.filter(note => note.vibrato).flatMap(note => {
    const settings = vibratoSettings(note);
    const onset = note.startTime + note.length * (1 - 1 / settings.cover);
    const from = Math.max(start, onset), to = Math.min(end, note.startTime + note.length);
    if (to <= from) return [];
    const beatSeconds = secondsBetween(note.startTime, note.startTime + beatFrames);
    if (!(beatSeconds > 0)) return [];
    return [{ start: secondsBetween(start, from), end: secondsBetween(start, to), phase: secondsBetween(onset, from), frequency: settings.cyclesPerBeat / beatSeconds, cents: settings.bend * 100 }];
  });
}

export function setNoteVibrato(snapshot: EditorSnapshot, ids: number[], enabled: boolean) {
  const selected = new Set(ids);
  snapshot.notes = snapshot.notes.map(note => selected.has(note.id) ? {...note, vibrato: enabled} : note);
}

/** Use the existing extensible lane metadata so older APIs keep this articulation. */
export function serializeVibrato(snapshot: EditorSnapshot): EditorSnapshot {
  if (!snapshot.notes.some(note => note.vibrato) && snapshot.chordEditor?.noteVibrato === undefined) return snapshot;
  return {...snapshot, chordEditor: {...snapshot.chordEditor,
    noteVibrato: snapshot.notes.filter(note => note.vibrato).map(note => note.id),
    noteVibratoSettings: Object.fromEntries(snapshot.notes.filter(note => note.vibrato).map(note => [note.id, vibratoSettings(note)])),
  }};
}

export function restoreVibrato(snapshot: EditorSnapshot): EditorSnapshot {
  const stored = snapshot.chordEditor?.noteVibrato;
  if (!Array.isArray(stored) || !stored.length) return snapshot;
  const ids = new Set(stored.filter(id => typeof id === 'number'));
  const settings = snapshot.chordEditor?.noteVibratoSettings as Record<string, Note["vibratoSettings"]> | undefined;
  return {...snapshot, notes: snapshot.notes.map(note => {
    const enabled = note.vibrato ?? ids.has(note.id);
    return enabled ? {...note, vibrato: true, ...(note.vibratoSettings || settings?.[note.id] ? {vibratoSettings: vibratoSettings({vibratoSettings: note.vibratoSettings ?? settings?.[note.id]})} : {})} : note;
  })};
}
