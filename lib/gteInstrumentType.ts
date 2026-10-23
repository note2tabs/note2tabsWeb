import type { EditorSnapshot } from "../types/gte";

export type InstrumentType = NonNullable<EditorSnapshot["instrumentType"]>;
type Track = Pick<EditorSnapshot, "editorType" | "type" | "trackType" | "instrumentId"> & Partial<Pick<EditorSnapshot, "instrumentType" | "chordEditor">>;
export function getTrackInstrumentType(track: Track): InstrumentType {
  const kind = String(track.editorType ?? track.trackType ?? track.type ?? "tab").toLowerCase();
  if (kind === "drums" || kind === "drum") return "drums";
  const explicit = track.instrumentType ?? track.chordEditor?.instrumentType;
  if (["notation", "guitar-tab", "bass-tab"].includes(String(explicit))) return explicit as InstrumentType;
  if (kind === "bass") return "bass-tab";
  if (kind === "chords") return "guitar-tab";
  return ["piano", "strings", "notation", "instrument"].includes(kind) || /^(upright_piano|gm:(piano|strings|synth-lead|synth-pad|instrument))$/.test(track.instrumentId ?? "") ? "notation" : "guitar-tab";
}
export const defaultInstrumentSound = (type: InstrumentType) => type === "notation" ? "upright_piano" : type === "bass-tab" ? "bass_overdrive" : type === "drums" ? "drum1" : "acoustic";
