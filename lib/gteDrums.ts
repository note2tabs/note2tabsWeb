import type { Note } from "../types/gte";

export type DrumVoiceId =
  | "crash"
  | "ride"
  | "closed_hi_hat"
  | "open_hi_hat"
  | "high_tom"
  | "mid_tom"
  | "snare"
  | "floor_tom"
  | "kick";

export type DrumVoice = {
  id: DrumVoiceId;
  label: string;
  shortLabel: string;
  midi: number;
  key: number;
  sampleStem: string;
};

export const DRUM_VOICES: readonly DrumVoice[] = [
  { id: "crash", label: "Crash cymbal", shortLabel: "CC", midi: 49, key: 1, sampleStem: "cymbal" },
  { id: "ride", label: "Ride cymbal", shortLabel: "RD", midi: 51, key: 2, sampleStem: "cymbal" },
  {
    id: "closed_hi_hat",
    label: "Closed hi-hat",
    shortLabel: "CHH",
    midi: 42,
    key: 3,
    sampleStem: "closed_hi_hat",
  },
  {
    id: "open_hi_hat",
    label: "Open hi-hat",
    shortLabel: "OHH",
    midi: 46,
    key: 4,
    sampleStem: "open_hi_hat",
  },
  { id: "high_tom", label: "High tom", shortLabel: "HT", midi: 50, key: 5, sampleStem: "bass" },
  { id: "mid_tom", label: "Mid tom", shortLabel: "MT", midi: 47, key: 6, sampleStem: "bass" },
  { id: "snare", label: "Snare drum", shortLabel: "SD", midi: 38, key: 7, sampleStem: "snare" },
  { id: "floor_tom", label: "Floor tom", shortLabel: "FT", midi: 41, key: 8, sampleStem: "bass" },
  { id: "kick", label: "Bass drum", shortLabel: "BD", midi: 36, key: 9, sampleStem: "kick" },
] as const;

export const DEFAULT_DRUM_HIT_LENGTH = 30;

const clampVoiceIndex = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(DRUM_VOICES.length - 1, Math.round(parsed)));
};

export const getDrumVoiceByIndex = (index: unknown) =>
  DRUM_VOICES[clampVoiceIndex(index)];

export const getDrumVoiceByMidi = (midi: unknown) => {
  const parsed = Number(midi);
  return DRUM_VOICES.find((voice) => voice.midi === parsed) ?? null;
};

export const getDrumVoiceForNote = (note: Pick<Note, "tab" | "midiNum">) =>
  getDrumVoiceByMidi(note.midiNum) ?? getDrumVoiceByIndex(note.tab?.[0]);

export const isSupportedDrumNote = (note: Pick<Note, "tab" | "midiNum">) => {
  if (getDrumVoiceByMidi(note.midiNum)) return true;
  const voiceIndex = Number(note.tab?.[0]);
  return Number.isInteger(voiceIndex) && voiceIndex >= 0 && voiceIndex < DRUM_VOICES.length;
};

export const buildDrumNote = (input: {
  id: number;
  startTime: number;
  voiceIndex: number;
  length?: number;
}): Note => {
  const voiceIndex = clampVoiceIndex(input.voiceIndex);
  const voice = DRUM_VOICES[voiceIndex];
  const parsedId = Number(input.id);
  const parsedStartTime = Number(input.startTime);
  const parsedLength = Number(input.length);
  return {
    id: Number.isFinite(parsedId) ? Math.round(parsedId) : -1,
    startTime: Number.isFinite(parsedStartTime)
      ? Math.max(0, Math.round(parsedStartTime))
      : 0,
    length: Number.isFinite(parsedLength)
      ? Math.max(1, Math.round(parsedLength))
      : DEFAULT_DRUM_HIT_LENGTH,
    midiNum: voice.midi,
    tab: [voiceIndex, 0],
    optimals: [],
  };
};

export const isDrumTrackType = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "drum" || normalized === "drums" || normalized === "percussion";
};

export const snapDrumFrameToGrid = (
  frame: number,
  beatsPerBar: number,
  subdivisionsPerBeat: number,
  framesPerBar = 480
) => {
  const safeFramesPerBar = Math.max(1, Math.round(Number(framesPerBar) || 480));
  const safeBeats = Math.max(1, Math.round(Number(beatsPerBar) || 1));
  const safeSubdivisions = Math.max(1, Math.round(Number(subdivisionsPerBeat) || 1));
  const unitsPerBar = safeBeats * safeSubdivisions;
  const safeFrame = Math.max(0, Number(frame) || 0);
  const barIndex = Math.floor(safeFrame / safeFramesPerBar);
  const barStart = barIndex * safeFramesPerBar;
  const unitIndex = Math.round(
    ((safeFrame - barStart) / safeFramesPerBar) * unitsPerBar
  );
  return barStart + Math.round((unitIndex * safeFramesPerBar) / unitsPerBar);
};
