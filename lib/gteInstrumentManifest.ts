import rawManifest from "../public/sound_samples/manifest.json";

export type TrackSampleDefinition = {
  midi: number;
  url: string;
};

export type TrackInstrumentOption = {
  id: string;
  label: string;
  kind: "opus";
  gain: number;
  samples: TrackSampleDefinition[];
};

type RawManifestEntry = {
  id?: unknown;
  label?: unknown;
  folder?: unknown;
  gain?: unknown;
  samples?: unknown;
};

const parseManifest = (value: unknown): TrackInstrumentOption[] => {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.flatMap((entry) => {
    const raw = entry && typeof entry === "object" ? (entry as RawManifestEntry) : null;
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    const label = typeof raw?.label === "string" ? raw.label.trim() : "";
    const folder = typeof raw?.folder === "string" ? raw.folder.trim().replace(/^\/+|\/+$/g, "") : "";
    const sampleRecord =
      raw?.samples && typeof raw.samples === "object"
        ? (raw.samples as Record<string, unknown>)
        : {};
    if (!id || !label || !folder || seenIds.has(id)) return [];

    const samples = Object.entries(sampleRecord)
      .flatMap(([midiValue, fileValue]) => {
        const midi = Number(midiValue);
        const file = typeof fileValue === "string" ? fileValue.trim() : "";
        if (!Number.isFinite(midi) || !file || file.toLowerCase().startsWith("mute_")) return [];
        return [{ midi, url: `/sound_samples/${folder}/${file}` }];
      })
      .sort((left, right) => left.midi - right.midi);
    if (!samples.length) return [];

    seenIds.add(id);
    const gain = Number(raw?.gain);
    return [
      {
        id,
        label,
        kind: "opus" as const,
        gain: Number.isFinite(gain) ? Math.max(0, gain) : 1,
        samples,
      },
    ];
  });
};

export const TRACK_INSTRUMENT_OPTIONS = parseManifest(rawManifest);

if (!TRACK_INSTRUMENT_OPTIONS.length) {
  throw new Error("public/sound_samples/manifest.json must contain at least one Opus instrument.");
}

export const DEFAULT_TRACK_INSTRUMENT_ID = TRACK_INSTRUMENT_OPTIONS[0].id;

const LEGACY_INSTRUMENT_IDS: Record<string, string> = {
  "builtin:sine": "acoustic",
  "Nylon-Guitar": "acoustic",
  "acoustic-steel": "acoustic",
  "jazz-guitar": "jazz",
  "clean-guitar": "electric",
  "muted-guitar": "electric",
  "overdriven-guitar": "electric_overdrive",
  "distortion-guitar": "electric_distortion",
};

export const normalizeTrackInstrumentId = (value: unknown) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const migrated = LEGACY_INSTRUMENT_IDS[trimmed] ?? trimmed;
  return TRACK_INSTRUMENT_OPTIONS.some((option) => option.id === migrated)
    ? migrated
    : DEFAULT_TRACK_INSTRUMENT_ID;
};

export const getTrackInstrumentOptions = () => TRACK_INSTRUMENT_OPTIONS.slice();

export const getTrackInstrumentOption = (value?: string | null) => {
  const id = normalizeTrackInstrumentId(value);
  return (
    TRACK_INSTRUMENT_OPTIONS.find((option) => option.id === id) ??
    TRACK_INSTRUMENT_OPTIONS[0]
  );
};
