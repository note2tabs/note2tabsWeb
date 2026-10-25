import type { EditorSnapshot } from "../types/gte";
import { scoreEvents, scoreEventSelected, type ScoreSelection } from "./gteNotation";
import { getTrackInstrumentType } from "./gteInstrumentType";
import { quantizeNotationEvents, SCORE_WHOLE } from "./gteNotationScore";
import { assignNoteVoices } from "./gteVoiceAssignment";

export const VOICE_ASSIGNMENT_VERSION = 1;
const valid = (voice: unknown): voice is 1 | 2 => voice === 1 || voice === 2;
/** Shared entry point for imports, Sheets transitions and the Tools action.
 * Existing explicit/legacy choices are conservative; only auto choices may be
 * recalculated by a manual action. Context notes remain hard constraints. */
export function assignVoices({ track, scope, preserveExisting = true, respectManualLocks = true, reassignLegacy = false, contextRange }: {
  track: EditorSnapshot; scope?: ScoreSelection; preserveExisting?: boolean; respectManualLocks?: boolean;
  reassignLegacy?: boolean;
  contextRange?: { start: number; end: number };
}): { track: EditorSnapshot; warnings: string[]; changed: boolean } {
  if (getTrackInstrumentType(track) === "drums") return { track, warnings: [], changed: false };
  const events = scoreEvents(track);
  const notesById = new Map(track.notes.map(note => [note.id, note]));
  const chordsById = new Map(track.chords.map(chord => [chord.id, chord]));
  const selected = scope && (scope.noteIds.length || scope.chordIds.length || scope.eventKeys?.length) ? scope : undefined;
  const metadata = new Map<string, { voice?: 1 | 2; source?: string; locked?: boolean }>();
  for (const event of events) {
    const item = event.noteId !== undefined ? notesById.get(event.noteId)! : chordsById.get(event.chordId!)!;
    const voice = "notationMemberVoices" in item ? item.notationMemberVoices?.[event.member] ?? item.notationVoice : item.notationVoice;
    metadata.set(event.key, { voice, source: item.notationVoiceSource, locked: item.notationVoiceLocked });
  }
  const editable = new Set(events.filter(event => {
    const meta = metadata.get(event.key)!;
    return (!selected || scoreEventSelected(event, selected)) && (!contextRange || event.start < contextRange.end && event.start + event.length > contextRange.start)
      && !(respectManualLocks && valid(meta.voice) && (meta.locked || meta.source === "manual"))
      && !(valid(meta.voice) && (preserveExisting || meta.source !== "auto" && !(reassignLegacy && meta.source === undefined)));
  }).map(event => event.key));
  if (!editable.size) return { track, warnings: track.notation?.voiceWarnings ?? [], changed: false };
  const barTicks = SCORE_WHOLE * (track.timeSignature || 4) / (track.timeSignatureBottom || 4);
  const groups = quantizeNotationEvents(events, barTicks / (track.framesPerMessure || 480), barTicks);
  const result = assignNoteVoices(groups.flatMap(group => group.events.map(event => ({ id: event.key, pitch: event.midi, onset: group.start, duration: group.end - group.start,
    existingVoice: metadata.get(event.key)?.voice, voiceLocked: !editable.has(event.key) && valid(metadata.get(event.key)?.voice) }))), { beatTicks: SCORE_WHOLE / (track.timeSignatureBottom || 4) });
  const voices = new Map(result.assignments.map(item => [item.noteId, item.voice]));
  const notes = track.notes.map(note => editable.has("n:" + note.id) ? { ...note, notationVoice: voices.get("n:" + note.id)!, notationVoiceSource: "auto" as const } : note);
  const chords = track.chords.map(chord => {
    const members = events.filter(event => event.chordId === chord.id);
    if (!members.some(event => editable.has(event.key))) return chord;
    const memberVoices = members.map(event => editable.has(event.key) ? voices.get(event.key)! : event.voice ?? 1);
    const uniform = memberVoices.every(voice => voice === memberVoices[0]);
    return { ...chord, notationVoice: uniform ? memberVoices[0] : undefined, notationMemberVoices: uniform ? undefined : memberVoices, notationVoiceSource: "auto" as const };
  });
  const warnings = [...new Set([...(track.notation?.voiceWarnings?.filter(warning => warning.includes("more than two voices")) ?? []), ...result.warnings])];
  return { track: { ...track, notes, chords, notation: { ...track.notation, voiceAssignmentVersion: VOICE_ASSIGNMENT_VERSION, voiceWarnings: warnings } }, warnings, changed: true };
}
