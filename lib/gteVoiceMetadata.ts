import type { Chord, Note } from "../types/gte";
/** Keep musical voice identity when existing editing tools materialize chords. */
export function noteVoiceMetadata(chord: Chord, member: number): Pick<Note, "notationVoice" | "notationVoiceSource" | "notationVoiceLocked"> {
  return { notationVoice: chord.notationMemberVoices?.[member] ?? chord.notationVoice, notationVoiceSource: chord.notationVoiceSource, notationVoiceLocked: chord.notationVoiceLocked };
}
export function chordVoiceMetadata(notes: readonly Note[]): Pick<Chord, "notationVoice" | "notationMemberVoices" | "notationVoiceSource" | "notationVoiceLocked"> {
  if (!notes.some(note => note.notationVoice !== undefined)) return {};
  const voices = notes.map(note => note.notationVoice ?? 1);
  const source = notes.some(note => note.notationVoiceSource === "manual") ? "manual" : notes.some(note => note.notationVoiceSource === "import") ? "import" : notes.every(note => note.notationVoiceSource === "auto") ? "auto" : undefined;
  return { notationVoice: voices.every(voice => voice === voices[0]) ? voices[0] : undefined,
    notationMemberVoices: voices.every(voice => voice === voices[0]) ? undefined : voices,
    notationVoiceSource: source, notationVoiceLocked: notes.some(note => note.notationVoiceLocked) };
}
