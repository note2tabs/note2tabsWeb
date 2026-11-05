import type { EditorSnapshot } from "../types/gte";
import { getTrackInstrumentOption, trackInstrumentFamily } from "./gteInstrumentManifest";

export type TrackInstrumentIconKind = "guitar" | "bass" | "drums" | "piano" | "strings" | "synth" | "instrument";
export function trackInstrumentIconKind(lane: Pick<EditorSnapshot, "instrumentId" | "trackType" | "editorType" | "type">): TrackInstrumentIconKind {
  const type = [lane.trackType, lane.editorType, lane.type].join(" ").toLowerCase();
  const instrument = String(lane.instrumentId || "").toLowerCase();
  if (type.includes("drum") || instrument.includes("drum")) return "drums";
  if (type.includes("bass") || instrument.includes("bass")) return "bass";
  if (/piano|keyboard|organ/.test(instrument)) return "piano";
  if (/strings|violin|cello/.test(instrument)) return "strings";
  if (instrument.includes("synth")) return "synth";
  if (instrument.startsWith("gm:")) return "instrument";
  const family = trackInstrumentFamily(getTrackInstrumentOption(lane.instrumentId));
  if (family === "Strings") return "strings";
  if (family === "Organ & reeds" || family === "Piano") return "piano";
  if (!["Guitar", "Bass"].includes(family)) return "instrument";
  return "guitar";
}
