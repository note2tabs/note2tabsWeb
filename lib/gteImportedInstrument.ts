import { normalizeTrackInstrumentId } from "./gteInstrumentManifest";
import { defaultInstrumentSound, type InstrumentType } from "./gteInstrumentType";

const PROGRAM_SOUNDS: Record<number, string> = {
    0: "upright_piano", 1: "upright_piano", 2: "upright_piano", 3: "upright_piano", 4: "upright_piano", 5: "upright_piano",
    6: "harpsichord", 13: "xylophone",
    16: "organ", 17: "organ", 18: "organ", 19: "organ", 20: "organ", 21: "accordion", 22: "harmonica", 23: "accordion",
    40: "SViolinVib", 46: "harp", 56: "TrumpetSus", 57: "TromboneSus", 60: "FHornSus",
    64: "saxophone", 65: "saxophone", 66: "saxophone", 67: "saxophone", 72: "FluteSusNV", 73: "FluteSusNV",
    105: "banjo",
  };
const NAMED_SOUNDS: Array<[RegExp, string]> = [
    [/harpsichord/i, "harpsichord"], [/xylophone/i, "xylophone"], [/accordion|bandoneon|concertina/i, "accordion"],
    [/harmonica/i, "harmonica"], [/organ/i, "organ"], [/ukulele/i, "ukulele"], [/banjo/i, "banjo"],
    [/harp(?!sichord)/i, "harp"], [/violin/i, "SViolinVib"], [/trumpet/i, "TrumpetSus"], [/trombone/i, "TromboneSus"],
    [/french.?horn|FHornSus/i, "FHornSus"], [/sax/i, "saxophone"], [/flute|piccolo/i, "FluteSusNV"],
    [/grand.?piano/i, "grand_piano"], [/piano/i, "upright_piano"], [/strings|viola|cello|contrabass/i, "gm:strings"],
    [/synth.?lead/i, "synth_lead"], [/synth.?pad/i, "synth_lead_sweepPad"],
  ];


export function importedInstrument(record: { trackType?: unknown; type?: unknown; instrumentType?: unknown; instrumentId?: unknown; program?: unknown; name?: unknown }): { instrumentType: InstrumentType; instrumentId: string } {
  const kind = String(record.trackType ?? record.type ?? "").toLowerCase();
  const name = String(record.name ?? "");
  const sound = String(record.instrumentId ?? "");
  const program = record.program == null || record.program === "" ? NaN : Number(record.program);
  const validProgram = Number.isInteger(program) && program >= 0 && program <= 127;
  if (kind === "drums" || kind === "drum") return { instrumentType: "drums", instrumentId: "drum1" };
  const namedPitched = /piano|strings|violin|viola|cello|contrabass|flute|brass|organ|clarinet|sax|trumpet|trombone|horn|oboe|bassoon|harp|accordion|harmonica|xylophone|ukulele|banjo/i.test(name + " " + kind);
  const bass = validProgram ? program >= 32 && program <= 39 : !/\bbassoon\b|clarinet|flute|trombone|sax/i.test(name) && (kind === "bass" || /^(gm:bass|bass_overdrive)$/.test(sound) || /\bbass\b/i.test(name));
  const guitar = validProgram ? program >= 24 && program <= 31 : /guitar/i.test(name + " " + kind) || !namedPitched && /guitar|^(acoustic|jazz|electric)/i.test(sound);
  const pitched = validProgram && !bass && !guitar || /piano|strings|synth|notation|instrument|violin|viola|cello|contrabass|flute|brass|organ|clarinet|sax|trumpet|trombone|horn|oboe|bassoon|harp|accordion|harmonica|xylophone|ukulele|banjo/i.test(sound + " " + kind + " " + name);
  const explicit = record.instrumentType;
  const instrumentType: InstrumentType = explicit === "notation" || explicit === "guitar-tab" || explicit === "bass-tab" ? explicit : bass ? "bass-tab" : guitar ? "guitar-tab" : pitched || kind !== "tab" ? "notation" : "guitar-tab";
  // The model's GM program is authoritative; names and legacy sound ids only decide when it is missing.
  if (validProgram && (guitar || bass)) {
    const guitarSounds: Record<number,string> = {24: "acoustic", 25: "acoustic", 26: "jazz", 27: "electric", 28: "electric", 29: "electric_overdrive", 30: "electric_distortion", 31: "electric"};
    return { instrumentType, instrumentId: bass ? "bass_overdrive" : guitarSounds[program] };
  }
  const hint = sound + " " + name;
  // General MIDI programs are zero-based. Use dedicated banks where available;
  // related instruments without a recording retain the existing honest fallback.
  const namedSound = !validProgram ? NAMED_SOUNDS.find(([pattern]) => pattern.test(hint))?.[1] : undefined;
  const fallback = validProgram
    ? PROGRAM_SOUNDS[program] ?? (program >= 40 && program <= 51 ? "gm:strings"
      : program >= 80 && program <= 87 ? "synth_lead" : program >= 88 && program <= 95 ? "synth_lead_sweepPad" : "gm:instrument")
    : namedSound ?? (instrumentType === "guitar-tab"
      ? /distort/i.test(hint) ? "electric_distortion" : /overdriv/i.test(hint) ? "electric_overdrive"
        : /jazz/i.test(hint) ? "jazz" : /electric|clean|muted/i.test(hint) ? "electric" : "acoustic"
      : instrumentType === "notation" ? "gm:instrument" : defaultInstrumentSound(instrumentType));
  const legacyGuitarDefault = instrumentType !== "guitar-tab" && /^(acoustic|jazz|electric.*)$/.test(sound);
  const normalized = normalizeTrackInstrumentId(sound);
  const knownSound = normalized !== "acoustic" || /^(acoustic|builtin:sine|Nylon-Guitar|acoustic-steel)$/.test(sound);
  const genericSound = sound.startsWith("gm:");
  return { instrumentType, instrumentId: normalizeTrackInstrumentId(knownSound && !genericSound && !legacyGuitarDefault && !validProgram ? normalized : fallback) };
}
