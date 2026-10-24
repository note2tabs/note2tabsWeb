import type { EditorSnapshot } from "../types/gte";
import { isNotationTrack } from "./gteNotation";

type Span = { start: number; end: number };
type StringEvent = Span & { key: string; owner: string; string: number; noteId?: number };
export function tinyOverlapToleranceFrames(snapshot: EditorSnapshot) {
  const quarter = (Number(snapshot.framesPerMessure) || 480) / Math.max(1, Number(snapshot.timeSignature) || 4);
  return quarter / 32;
}
export function isTinyBoundaryOverlap(snapshot: EditorSnapshot, a: Span, b: Span) {
  if (a.start === b.start) return false;
  const [earlier, later] = a.start < b.start ? [a, b] : [b, a];
  const overlap = earlier.end - later.start;
  const tolerance = Math.min(tinyOverlapToleranceFrames(snapshot), (earlier.end - earlier.start) * 0.05, (later.end - later.start) * 0.05);
  return overlap > 0 && overlap <= tolerance + 1e-8;
}
function stringEvents(snapshot: EditorSnapshot) {
  // Notation has no physical strings: only repeated pitches within the same
  // manually assigned voice compete. Different pitches remain polyphonic.
  const pitched = isNotationTrack(snapshot);
  const events: StringEvent[] = snapshot.notes.map((note) => ({ key: `note-${note.id}`, owner: `n:${note.id}`, string: pitched ? note.midiNum + 128 * (note.notationVoice ?? 1) : note.tab[0], start: note.startTime, end: note.startTime + note.length, noteId: note.id }));
  snapshot.chords.forEach((chord) => chord.currentTabs.forEach((tab, index) => events.push({ key: `chord-${chord.id}-${index}`, owner: `c:${chord.id}`, string: pitched ? chord.originalMidi[index] + 128 * (chord.notationVoice ?? 1) : tab[0], start: chord.startTime, end: chord.startTime + chord.length })));
  const strings = new Map<number, StringEvent[]>();
  events.filter((event) => Number.isFinite(event.start) && Number.isFinite(event.end) && event.end > event.start).forEach((event) => {
    const group = strings.get(event.string) ?? []; group.push(event); strings.set(event.string, group);
  });
  strings.forEach((events) => events.sort((a, b) => a.start - b.start || a.end - b.end));
  return strings;
}
export function meaningfulConflictInfo(snapshot: EditorSnapshot) {
  const conflictKeys = new Set<string>(), noteConflicts = new Set<number>();
  stringEvents(snapshot).forEach((events) => {
    for (let i = 0; i < events.length; i += 1) {
      for (let j = i + 1; j < events.length && events[j].start < events[i].end; j += 1) {
        const a = events[i], b = events[j];
        if (isTinyBoundaryOverlap(snapshot, a, b)) continue;
        conflictKeys.add(a.key); conflictKeys.add(b.key);
        if (a.noteId !== undefined) noteConflicts.add(a.noteId);
        if (b.noteId !== undefined) noteConflicts.add(b.noteId);
      }
    }
  });
  return { conflictKeys, noteConflicts };
}

/** Mutates durations only: no beat snapping, onset shifts, pitch or membership changes. */
export function cleanTinyOverlapsInSnapshot(snapshot: EditorSnapshot, options: { manual?: boolean } = {}) {
  if ([snapshot.trackType, snapshot.editorType, snapshot.type].some((type) => type === "drums" || type === "drum")) return 0;
  const ends = new Map<string, Map<number, number>>();
  stringEvents(snapshot).forEach((events, string) => events.forEach((event, index) => {
    // Skip simultaneous onsets; only consider the next genuinely later onset.
    let next = index + 1;
    while (next < events.length && events[next].start === event.start) next += 1;
    if (next >= events.length) return;
    const later = events[next];
    const overlap = event.end - later.start;
    // Short following notes must not shield a long preceding tail from cleanup.
    // Allow up to half a beat, but retain at least half the earlier duration.
    const manualTolerance = Math.min(tinyOverlapToleranceFrames(snapshot) * 16,
      (event.end - event.start) * 0.5);
    const eligible = options.manual ? overlap > 0 && overlap <= manualTolerance + 1e-8
      : isTinyBoundaryOverlap(snapshot, event, later);
    if (!eligible) return;
    const cuts = ends.get(event.owner) ?? new Map<number, number>();
    cuts.set(string, events[next].start); ends.set(event.owner, cuts);
  }));
  let changed = 0;
  snapshot.notes.forEach((note) => {
    const group = isNotationTrack(snapshot) ? note.midiNum + 128 * (note.notationVoice ?? 1) : note.tab[0];
    const end = ends.get(`n:${note.id}`)?.get(group);
    if (end !== undefined && end - note.startTime >= 1) { note.length = end - note.startTime; changed += 1; }
  });
  snapshot.chords.forEach((chord) => {
    const cuts = ends.get(`c:${chord.id}`);
    // Chord tones share one duration. Even a collision on one member trims the
    // chord to the earliest eligible boundary; requiring every string skipped
    // ordinary chord-to-note and partial chord-to-chord transitions.
    if (!cuts?.size) return;
    const end = Math.min(...cuts.values());
    const length = end - chord.startTime;
    if (length < 1 || chord.strums?.some((strum) => strum.time >= length)) return;
    chord.length = length; changed += 1;
  });
  return changed;
}
