/** Entry context changes presentation, never the model or instrument detection. */
export const TRANSCRIPTION_ENTRY_TITLES = {
  piano: "Transcribe piano audio",
  bass: "Transcribe bass audio",
  drums: "Transcribe drum audio",
  ukulele: "Transcribe ukulele audio",
} as const;
export function transcriptionEntryInstrument(value: unknown): keyof typeof TRANSCRIPTION_ENTRY_TITLES | undefined {
  return typeof value === "string" && Object.hasOwn(TRANSCRIPTION_ENTRY_TITLES, value)
    ? value as keyof typeof TRANSCRIPTION_ENTRY_TITLES : undefined;
}
export function transcriptionEntryHref(instrument: keyof typeof TRANSCRIPTION_ENTRY_TITLES, youtube = false) {
  return `/transcribe?instrument=${instrument}${youtube ? "&mode=youtube" : ""}`;
}
