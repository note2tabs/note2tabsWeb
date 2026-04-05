import type {
  Soundfont,
  SoundfontActiveZone,
  SoundfontPreset,
  SoundfontSample,
} from "sfumato";

export type BuiltinTrackInstrumentOption = {
  id: string;
  label: string;
  kind: "builtin";
  waveform: OscillatorType;
  gain?: number;
};

export type SoundfontTrackInstrumentOption = {
  id: string;
  label: string;
  kind: "sf2";
  file: string;
  bank: number;
  preset: number;
  gain?: number;
};

export type TrackInstrumentOption = BuiltinTrackInstrumentOption | SoundfontTrackInstrumentOption;

export type PreparedTrackInstrument =
  | {
      kind: "builtin";
      option: BuiltinTrackInstrumentOption;
    }
  | {
      kind: "sf2";
      option: SoundfontTrackInstrumentOption;
      preset: SoundfontPreset;
      getActiveZones: (preset: SoundfontPreset, midi: number) => SoundfontActiveZone[];
    };

type RawManifestEntry = {
  id?: unknown;
  label?: unknown;
  file?: unknown;
  bank?: unknown;
  preset?: unknown;
  gain?: unknown;
};

export type ScheduledTrackNote = {
  ctx: AudioContext;
  destination: AudioNode;
  instrument: PreparedTrackInstrument;
  midi: number;
  gain: number;
  startTime: number;
  duration: number;
};

const SOUND_FONT_MANIFEST_PATH = "/soundfonts/manifest.json";

const BUILTIN_TRACK_INSTRUMENTS: BuiltinTrackInstrumentOption[] = [
  {
    id: "builtin:sine",
    label: "Built-in synth",
    kind: "builtin",
    waveform: "sine",
    gain: 1,
  },
];

export const DEFAULT_TRACK_INSTRUMENT_ID = BUILTIN_TRACK_INSTRUMENTS[0].id;

let trackInstrumentOptionsPromise: Promise<TrackInstrumentOption[]> | null = null;
let sfumatoModulePromise: Promise<typeof import("sfumato")> | null = null;

const soundfontByFilePromise = new Map<string, Promise<Soundfont>>();
const preparedTrackInstrumentPromise = new Map<string, Promise<PreparedTrackInstrument>>();
const sampleBufferCache = new WeakMap<SoundfontSample, AudioBuffer>();

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const midiToFrequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const timecentsToSeconds = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const seconds = Math.pow(2, parsed / 1200);
  return clamp(seconds, min, max);
};

const centibelsToGain = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.pow(10, -parsed / 200);
};

const normalizeSoundfontPath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  return `/soundfonts/${trimmed.replace(/^\.?[/\\]+/, "")}`;
};

const getDefaultPreparedTrackInstrument = (): PreparedTrackInstrument => ({
  kind: "builtin",
  option: BUILTIN_TRACK_INSTRUMENTS[0],
});

const parseTrackInstrumentManifest = (value: unknown): SoundfontTrackInstrumentOption[] => {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set(BUILTIN_TRACK_INSTRUMENTS.map((option) => option.id));
  return value.flatMap((entry) => {
    const raw = entry && typeof entry === "object" ? (entry as RawManifestEntry) : null;
    if (!raw) return [];
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const file = typeof raw.file === "string" ? normalizeSoundfontPath(raw.file) : "";
    if (!id || !label || !file || seenIds.has(id)) return [];
    seenIds.add(id);
    return [
      {
        id,
        label,
        kind: "sf2" as const,
        file,
        bank: clamp(Math.round(toFiniteNumber(raw.bank, 0)), 0, 16383),
        preset: clamp(Math.round(toFiniteNumber(raw.preset, 0)), 0, 127),
        gain: Math.max(0, toFiniteNumber(raw.gain, 1)),
      },
    ];
  });
};

const loadTrackInstrumentManifest = async (): Promise<SoundfontTrackInstrumentOption[]> => {
  if (typeof window === "undefined") return [];
  try {
    const response = await fetch(SOUND_FONT_MANIFEST_PATH, { cache: "no-store" });
    if (!response.ok) {
      console.warn(`[gteSoundfonts] Could not load ${SOUND_FONT_MANIFEST_PATH}: ${response.status}`);
      return [];
    }
    const payload = (await response.json()) as unknown;
    return parseTrackInstrumentManifest(payload);
  } catch (error) {
    console.warn(`[gteSoundfonts] Invalid soundfont manifest at ${SOUND_FONT_MANIFEST_PATH}.`, error);
    return [];
  }
};

const loadSfumatoModule = async () => {
  if (!sfumatoModulePromise) {
    sfumatoModulePromise = import("sfumato");
  }
  return sfumatoModulePromise;
};

const loadSoundfontByFile = async (file: string): Promise<Soundfont> => {
  const normalized = normalizeSoundfontPath(file);
  const existing = soundfontByFilePromise.get(normalized);
  if (existing) return existing;
  const next = loadSfumatoModule().then((module) => module.loadSoundfont(normalized));
  soundfontByFilePromise.set(normalized, next);
  return next;
};

const getTrackInstrumentOptionById = async (instrumentId?: string | null): Promise<TrackInstrumentOption> => {
  const normalizedId = normalizeTrackInstrumentId(instrumentId);
  const options = await loadTrackInstrumentOptions();
  return options.find((option) => option.id === normalizedId) ?? BUILTIN_TRACK_INSTRUMENTS[0];
};

const getSoundfontPreset = (soundfont: Soundfont, option: SoundfontTrackInstrumentOption) => {
  return soundfont.banks[option.bank]?.presets[option.preset] ?? null;
};

const getSampleBuffer = (ctx: AudioContext, sample: SoundfontSample) => {
  const cached = sampleBufferCache.get(sample);
  if (cached) return cached;
  const floatData = new Float32Array(sample.data.length);
  for (let index = 0; index < sample.data.length; index += 1) {
    floatData[index] = sample.data[index] / 32768;
  }
  const buffer = ctx.createBuffer(1, floatData.length, sample.header.sampleRate);
  buffer.copyToChannel(floatData, 0);
  sampleBufferCache.set(sample, buffer);
  return buffer;
};

const scheduleBuiltinSynthNote = (
  destination: AudioNode,
  option: BuiltinTrackInstrumentOption,
  params: Omit<ScheduledTrackNote, "destination" | "instrument">
) => {
  const { ctx, midi, gain, startTime, duration } = params;
  if (!Number.isFinite(midi) || midi <= 0) return;
  const stopAt = startTime + Math.max(0.05, duration);
  const peak = Math.max(0, gain * Math.max(0, option.gain ?? 1));

  const oscillator = ctx.createOscillator();
  oscillator.type = option.waveform;
  oscillator.frequency.setValueAtTime(midiToFrequency(midi), startTime);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, startTime);
  amp.gain.linearRampToValueAtTime(peak, startTime + 0.01);
  amp.gain.setValueAtTime(peak, Math.max(startTime + 0.01, stopAt - 0.01));
  amp.gain.linearRampToValueAtTime(0, stopAt);

  oscillator.connect(amp);
  amp.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(stopAt + 0.02);
};

const scheduleSoundfontNote = (
  destination: AudioNode,
  instrument: Extract<PreparedTrackInstrument, { kind: "sf2" }>,
  params: Omit<ScheduledTrackNote, "destination" | "instrument">
) => {
  const { ctx, midi, gain, startTime, duration } = params;
  const zones = instrument.getActiveZones(instrument.preset, midi);
  if (!zones.length) {
    scheduleBuiltinSynthNote(destination, BUILTIN_TRACK_INSTRUMENTS[0], params);
    return;
  }

  const zoneGainScale = 1 / Math.sqrt(zones.length);
  const noteDuration = Math.max(0.05, duration);

  zones.forEach((zone) => {
    const generators = zone.mergedGenerators || {};
    const sample = zone.sample;
    const buffer = getSampleBuffer(ctx, sample);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const rootKey =
      Number.isFinite(generators.overridingRootKey) && generators.overridingRootKey !== -1
        ? Number(generators.overridingRootKey)
        : sample.header.originalPitch;
    const fineTune = toFiniteNumber(generators.fineTune, 0);
    const playbackRate = Math.pow(
      2,
      (midi * 100 - (rootKey * 100 + sample.header.pitchCorrection - fineTune)) / 1200
    );
    source.playbackRate.setValueAtTime(playbackRate, startTime);

    const sampleModes = Math.round(toFiniteNumber(generators.sampleModes, 0));
    const startLoop =
      sample.header.startLoop +
      Math.round(toFiniteNumber(generators.startloopAddrsOffset, 0)) +
      Math.round(toFiniteNumber(generators.startloopAddrsCoarseOffset, 0)) * 32768;
    const endLoop =
      sample.header.endLoop +
      Math.round(toFiniteNumber(generators.endloopAddrsOffset, 0)) +
      Math.round(toFiniteNumber(generators.endloopAddrsCoarseOffset, 0)) * 32768;
    if (sampleModes === 1 && endLoop > startLoop) {
      source.loop = true;
      source.loopStart = startLoop / sample.header.sampleRate;
      source.loopEnd = endLoop / sample.header.sampleRate;
    }

    const amp = ctx.createGain();
    const peakGain =
      gain *
      zoneGainScale *
      centibelsToGain(generators.initialAttenuation, 1) *
      Math.max(0, instrument.option.gain ?? 1);
    const attack = timecentsToSeconds(generators.attackVolEnv, 0.01, 0.001, 0.4);
    const hold = timecentsToSeconds(generators.holdVolEnv, 0, 0, 0.25);
    const decay = timecentsToSeconds(generators.decayVolEnv, 0.1, 0.001, 1.2);
    const release = timecentsToSeconds(generators.releaseVolEnv, 0.12, 0.01, 2.5);
    const sustainLevel = clamp(1 - toFiniteNumber(generators.sustainVolEnv, 0) / 1000, 0, 1);
    const sustainGain = peakGain * sustainLevel;
    const attackEnd = startTime + attack;
    const holdEnd = attackEnd + hold;
    const decayEnd = holdEnd + decay;
    const releaseStart = startTime + noteDuration;
    const releaseEnd = releaseStart + release;

    amp.gain.setValueAtTime(0, startTime);
    amp.gain.linearRampToValueAtTime(peakGain, attackEnd);
    amp.gain.setValueAtTime(peakGain, holdEnd);
    amp.gain.linearRampToValueAtTime(sustainGain, decayEnd);
    amp.gain.setValueAtTime(sustainGain, Math.max(decayEnd, releaseStart));
    amp.gain.linearRampToValueAtTime(0, releaseEnd);

    const panValue = clamp(toFiniteNumber(generators.pan, 0) / 1000, -1, 1);
    const panner =
      typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = panValue;
      source.connect(amp);
      amp.connect(panner);
      panner.connect(destination);
    } else {
      source.connect(amp);
      amp.connect(destination);
    }

    source.start(startTime);
    source.stop(releaseEnd + 0.05);
  });
};

export const normalizeTrackInstrumentId = (value: unknown) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || DEFAULT_TRACK_INSTRUMENT_ID;
};

export const getBuiltinTrackInstrumentOptions = () => BUILTIN_TRACK_INSTRUMENTS.slice();

export const loadTrackInstrumentOptions = async (): Promise<TrackInstrumentOption[]> => {
  if (!trackInstrumentOptionsPromise) {
    trackInstrumentOptionsPromise = loadTrackInstrumentManifest().then((manifest) => [
      ...BUILTIN_TRACK_INSTRUMENTS,
      ...manifest,
    ]);
  }
  return trackInstrumentOptionsPromise;
};

export const prepareTrackInstrument = async (
  instrumentId?: string | null
): Promise<PreparedTrackInstrument> => {
  const normalizedId = normalizeTrackInstrumentId(instrumentId);
  const existing = preparedTrackInstrumentPromise.get(normalizedId);
  if (existing) return existing;

  const next = (async () => {
    const option = await getTrackInstrumentOptionById(normalizedId);
    if (option.kind === "builtin") {
      return { kind: "builtin", option } as PreparedTrackInstrument;
    }
    const [sfumato, soundfont] = await Promise.all([
      loadSfumatoModule(),
      loadSoundfontByFile(option.file),
    ]);
    const preset = getSoundfontPreset(soundfont, option);
    if (!preset) {
      console.warn(
        `[gteSoundfonts] Missing preset bank=${option.bank} preset=${option.preset} in ${option.file}.`
      );
      return getDefaultPreparedTrackInstrument();
    }
    return {
      kind: "sf2",
      option,
      preset,
      getActiveZones: sfumato.getActiveZones,
    } as PreparedTrackInstrument;
  })().catch(() => getDefaultPreparedTrackInstrument());

  preparedTrackInstrumentPromise.set(normalizedId, next);
  return next;
};

export const warmTrackInstrument = async (instrumentId?: string | null) => {
  try {
    await prepareTrackInstrument(instrumentId);
  } catch {
    // Keep playback resilient; the builtin fallback will be used on demand.
  }
};

export const schedulePreparedTrackNote = ({
  destination,
  instrument,
  ...params
}: ScheduledTrackNote) => {
  if (instrument.kind === "sf2") {
    scheduleSoundfontNote(destination, instrument, params);
    return;
  }
  scheduleBuiltinSynthNote(destination, instrument.option, params);
};
