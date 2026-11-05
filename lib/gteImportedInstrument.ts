import { normalizeTrackInstrumentId } from "./gteInstrumentManifest";
import { defaultInstrumentSound, type InstrumentType } from "./gteInstrumentType";

export function importedInstrument(record: { trackType?: unknown; type?: unknown; instrumentType?: unknown; instrumentId?: unknown; program?: unknown; name?: unknown }): { instrumentType: InstrumentType; instrumentId: string } {
  const kind = String(record.trackType ?? record.type ?? "").toLowerCase();
  const name = String(record.name ?? "");
  const sound = String(record.instrumentId ?? "");
  const program = record.program == null ? NaN : Number(record.program);
  const validProgram = Number.isInteger(program) && program >= 0 && program <= 127;
  if (kind === "drums" || kind === "drum") return { instrumentType: "drums", instrumentId: "drum1" };
  const bass = validProgram ? program >= 32 && program <= 39 : kind === "bass" || /^(gm:bass|bass_overdrive)$/.test(sound) || /\bbass\b/i.test(name) && !/\bbassoon\b|clarinet|flute|trombone|sax/i.test(name);
  const guitar = validProgram ? program >= 24 && program <= 31 : /guitar|^(acoustic|jazz|electric)/i.test(sound) || /guitar/i.test(name + " " + kind);
  const pitched = validProgram && !bass && !guitar || /piano|strings|synth|notation|instrument|violin|viola|cello|contrabass|flute|brass|organ|clarinet|sax|trumpet|trombone|horn|oboe|bassoon|harp/i.test(sound + " " + kind + " " + name);
  const explicit = record.instrumentType;
  const instrumentType: InstrumentType = explicit === "notation" || explicit === "guitar-tab" || explicit === "bass-tab" ? explicit : bass ? "bass-tab" : guitar ? "guitar-tab" : pitched || kind !== "tab" ? "notation" : "guitar-tab";
  // The model's GM program is authoritative; names and legacy sound ids only decide when it is missing.
  if (validProgram && (guitar || bass)) {
    const guitarSounds: Record<number,string> = {24: "acoustic", 25: "acoustic", 26: "jazz", 27: "electric", 28: "electric", 29: "electric_overdrive", 30: "electric_distortion", 31: "electric"};
    return { instrumentType, instrumentId: bass ? "bass_overdrive" : guitarSounds[program] };
  }
  const hint = sound + " " + name, named = (pattern: RegExp) => !validProgram && pattern.test(hint);
  const fallback = instrumentType === "notation"
    ? validProgram && program >= 40 && program <= 51 || named(/strings|violin|viola|cello|contrabass/i) ? "gm:strings"
      : validProgram && program >= 80 && program <= 87 || named(/synth.?lead/i) ? "gm:synth-lead"
      : validProgram && program >= 88 && program <= 95 || named(/synth.?pad/i) ? "gm:synth-pad"
      // Programs 4–5 are electric pianos. Use our recorded piano as the closest
      // available sound; we do not have a dedicated electric-piano sample bank.
      : validProgram && program <= 5 || named(/piano/i) ? "upright_piano" : "gm:instrument"
    : instrumentType === "guitar-tab" && !validProgram
      ? named(/distort/i) ? "electric_distortion" : named(/overdriv/i) ? "electric_overdrive" : named(/jazz/i) ? "jazz" : named(/electric|clean|muted/i) ? "electric" : "acoustic"
      : defaultInstrumentSound(instrumentType);
  const legacyGuitarDefault = instrumentType !== "guitar-tab" && /^(acoustic|jazz|electric.*)$/.test(sound);
  const normalized = normalizeTrackInstrumentId(sound);
  const knownSound = normalized !== "acoustic" || /^(acoustic|builtin:sine|Nylon-Guitar|acoustic-steel)$/.test(sound);
  const useProgramSound = validProgram && sound.startsWith("gm:");
  return { instrumentType, instrumentId: normalizeTrackInstrumentId(knownSound && sound !== "gm:piano" && sound !== "gm:instrument" && !legacyGuitarDefault && !useProgramSound ? normalized : fallback) };
}
