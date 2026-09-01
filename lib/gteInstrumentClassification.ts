import type { GteTrackType } from "../types/gte";

export type GteInstrumentClassification = {
  representation: GteTrackType;
  confidence: "high" | "medium" | "low";
};

const matches = (name: string, pattern: RegExp) => pattern.test(name.trim().toLowerCase());

export const classifyImportedInstrument = (input: {
  name?: string;
  midiProgram?: number;
  percussion?: boolean;
  explicitTablature?: boolean;
}): GteInstrumentClassification => {
  if (input.percussion) return { representation: "drums", confidence: "high" };
  const name = input.name || "";
  if (matches(name, /\b(drum|drums|percussion|kit)\b/)) {
    return { representation: "drums", confidence: "high" };
  }
  if (matches(name, /\b(bass|contrabass|double bass)\b/)) {
    return { representation: "bass", confidence: "high" };
  }
  if (matches(name, /\b(guitar|gtr|ukulele|banjo|mandolin)\b/) || input.explicitTablature) {
    return { representation: "guitar", confidence: input.explicitTablature ? "high" : "medium" };
  }
  const program = Number(input.midiProgram);
  if (Number.isInteger(program) && program >= 32 && program <= 39) {
    return { representation: "bass", confidence: "high" };
  }
  if (Number.isInteger(program) && program >= 24 && program <= 31) {
    return { representation: "guitar", confidence: "high" };
  }
  return { representation: "notation", confidence: name || Number.isInteger(program) ? "medium" : "low" };
};
