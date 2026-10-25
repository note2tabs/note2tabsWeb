/** Selection and playback brighten each voice without erasing its identity. */
export const MIDI_VOICE_COLORS = {
  1: { note: "#34b58b", selected: "#acf0d6", border: "#34856a", selectedBorder: "#174b37", text: "#123d2d" },
  2: { note: "#6599e8", selected: "#bfd9ff", border: "#4775b9", selectedBorder: "#244d89", text: "#173b6c" },
} as const;
export const midiVoiceColors = (voice?: number) => MIDI_VOICE_COLORS[voice === 2 ? 2 : 1];
