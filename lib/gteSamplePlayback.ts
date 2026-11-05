import { decodePlaybackSample, fetchPlaybackSample, playbackSampleUrl } from "./gteAudioSampleLoader";
import {
  DEFAULT_TRACK_INSTRUMENT_ID,
  getTrackInstrumentOption,
  getTrackInstrumentOptions,
  normalizeTrackInstrumentId,
  type TrackInstrumentOption,
  type TrackSampleDefinition,
} from "./gteInstrumentManifest";
import type { PlaybackVibrato } from "./gteVibrato";

export function applyVibratoAutomation(param: AudioParam, start: number, duration: number, windows?: PlaybackVibrato[]) {
  if (!windows?.length || duration <= 0) return;
  // Separate detune automation adds vibrato on top of the existing bend curve.
  const curve = new Float32Array(Math.max(2, Math.min(32768, Math.ceil(duration * 240) + 1)));
  for (let i = 0; i < curve.length; i++) {
    const time = i * duration / (curve.length - 1);
    for (const window of windows) {
      if (time < window.start || time >= window.end) continue;
      const elapsed = time - window.start + window.phase;
      const fade = Math.min(1, elapsed / 0.04, (window.end - time) / 0.02);
      curve[i] += window.cents * (1 - Math.cos(2 * Math.PI * window.frequency * elapsed)) / 2 * Math.max(0, fade);
    }
  }
  param.setValueCurveAtTime(curve, start, duration);
  param.setValueAtTime(0, start + duration);
}

export {
  DEFAULT_TRACK_INSTRUMENT_ID,
  getTrackInstrumentOptions,
  normalizeTrackInstrumentId,
  type TrackInstrumentOption,
};

export type PreparedTrackSample = TrackSampleDefinition & {
  buffer: AudioBuffer;
};

export type PreparedTrackInstrument = {
  kind: "opus" | "synth";
  option: TrackInstrumentOption;
  samples: PreparedTrackSample[];
};

export type ScheduledTrackNote = {
  ctx: AudioContext;
  destination: AudioNode;
  instrument: PreparedTrackInstrument;
  midi: number;
  gain: number;
  startTime: number;
  duration: number;
  vibrato?: PlaybackVibrato[];
  bendSegments?: Array<{
    holdSec: number;
    bendSec: number;
    targetCents: number;
  }>;
};

const decodedByContext = new WeakMap<AudioContext, Map<string, Promise<AudioBuffer>>>();
const preparedByContext = new WeakMap<
  AudioContext,
  Map<string, Promise<PreparedTrackInstrument>>
>();

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const centsToRatio = (cents: number) => Math.pow(2, cents / 1200);

const normalizeBendSegments = (
  segments: ScheduledTrackNote["bendSegments"],
  duration: number
) => {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const safeDuration = Math.max(0, duration);
  return segments
    .map((segment) => ({
      holdSec: clamp(toFiniteNumber(segment.holdSec, 0), 0, safeDuration),
      bendSec: clamp(toFiniteNumber(segment.bendSec, 0), 0, safeDuration),
      targetCents: toFiniteNumber(segment.targetCents, 0),
    }))
    .filter((segment) => segment.holdSec <= safeDuration);
};

const applyBendAutomationToRate = (
  param: AudioParam,
  baseValue: number,
  startTime: number,
  duration: number,
  bendSegments?: ScheduledTrackNote["bendSegments"]
) => {
  const segments = normalizeBendSegments(bendSegments, duration);
  param.setValueAtTime(baseValue, startTime);
  let currentCents = 0;
  segments.forEach((segment) => {
    const holdAt = startTime + segment.holdSec;
    const bendEndAt = startTime + Math.min(duration, segment.holdSec + segment.bendSec);
    param.setValueAtTime(baseValue * centsToRatio(currentCents), holdAt);
    param.linearRampToValueAtTime(baseValue * centsToRatio(segment.targetCents), bendEndAt);
    currentCents = segment.targetCents;
  });
};

export const findNearestTrackSample = <T extends { midi: number }>(
  samples: T[],
  midi: number
) =>
  samples.reduce<T | null>((nearest, sample) => {
    if (!nearest) return sample;
    const distance = Math.abs(sample.midi - midi);
    const nearestDistance = Math.abs(nearest.midi - midi);
    return distance < nearestDistance ||
      (distance === nearestDistance && sample.midi < nearest.midi)
      ? sample
      : nearest;
  }, null);

export const loadTrackInstrumentOptions = async () => getTrackInstrumentOptions();

export const prepareTrackInstrument = async (
  ctx: AudioContext,
  instrumentId?: string | null,
  requiredMidi?: readonly number[]
): Promise<PreparedTrackInstrument> => {
  const option = getTrackInstrumentOption(instrumentId);
  let contextCache = preparedByContext.get(ctx);
  if (!contextCache) {
    contextCache = new Map();
    preparedByContext.set(ctx, contextCache);
  }
  const selected = requiredMidi
    ? [...new Set(requiredMidi.filter(Number.isFinite).map(midi => findNearestTrackSample(option.samples, midi)).filter((sample): sample is TrackSampleDefinition => Boolean(sample)))]
    : option.samples;
  const cacheKey = option.id + ":" + selected.map(sample => sample.url).sort().join("|");
  const cached = contextCache.get(cacheKey);
  if (cached) return cached;

  if (option.kind === "synth") {
    return { kind: "synth", option, samples: [] };
  }
  const pending = Promise.all(
    selected.map(async (sample) => {
      let decoded = decodedByContext.get(ctx);
      if (!decoded) { decoded = new Map(); decodedByContext.set(ctx, decoded); }
      let pending = decoded.get(sample.url);
      if (!pending) {
        pending = decodePlaybackSample(ctx, sample.url);
        decoded.set(sample.url, pending);
        pending.catch(() => { if (decoded!.get(sample.url) === pending) decoded!.delete(sample.url); });
      }
      return { ...sample, buffer: await pending };
    })
  ).then((samples) => ({ kind: "opus" as const, option, samples }));
  pending.catch(() => { if (contextCache!.get(cacheKey) === pending) contextCache!.delete(cacheKey); });
  // Decoded samples are cached per context; bound prepared subset combinations.
  if (contextCache.size >= 64) contextCache.delete(contextCache.keys().next().value!);
  contextCache.set(cacheKey, pending);
  return pending;
};

export const warmTrackInstrument = async (instrumentId?: string | null, requiredMidi?: readonly number[]) => {
  if (typeof window === "undefined") return;
  const option = getTrackInstrumentOption(instrumentId);
  if (option.kind === "synth") return;
  try {
    const selected = requiredMidi ? [...new Set(requiredMidi.filter(Number.isFinite).map(midi => findNearestTrackSample(option.samples, midi)).filter((sample): sample is TrackSampleDefinition => Boolean(sample)))] : option.samples;
    // Limit network fan-out while warming an entire bank.
    for (let index = 0; index < selected.length; index += 4) await Promise.all(selected.slice(index, index + 4).map(sample => fetchPlaybackSample(playbackSampleUrl(sample.url))));
  } catch {
    // Playback reports the concrete loading error if the user tries to play this instrument.
  }
};

export const schedulePreparedTrackNote = ({
  ctx,
  destination,
  instrument,
  midi,
  gain,
  startTime,
  duration,
  bendSegments,
  vibrato,
}: ScheduledTrackNote) => {
  if (!Number.isFinite(midi) || midi <= 0) return;
  if (instrument.kind === "synth") {
    const oscillator = ctx.createOscillator();
    const amp = ctx.createGain();
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    oscillator.frequency.setValueAtTime(frequency, startTime);
    applyBendAutomationToRate(oscillator.frequency, frequency, startTime, duration, bendSegments);
    applyVibratoAutomation(oscillator.detune, startTime, duration, vibrato);
    oscillator.type = instrument.option.id === "gm:synth-lead" ? "square" :
      instrument.option.id === "gm:bass" ? "triangle" : "sine";
    const peak = Math.max(0, gain * instrument.option.gain);
    const attack = instrument.option.id === "gm:strings" || instrument.option.id === "gm:synth-pad" ? 0.08 : 0.01;
    const release = instrument.option.id === "gm:synth-pad" ? 0.25 : 0.1;
    amp.gain.setValueAtTime(0, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.min(attack, duration / 2));
    amp.gain.setValueAtTime(peak, startTime + Math.max(attack, duration));
    amp.gain.linearRampToValueAtTime(0, startTime + duration + release);
    oscillator.connect(amp);
    amp.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + release + 0.02);
    return;
  }
  const sample = findNearestTrackSample(instrument.samples, midi);
  if (!sample) return;

  const noteDuration = Math.max(0.05, duration);
  const release = 0.08;
  const releaseStart = startTime + noteDuration;
  const releaseEnd = releaseStart + release;
  const baseRate = Math.pow(2, (midi - sample.midi + (sample.tuning ?? 0) / 100) / 12);

  const source = ctx.createBufferSource();
  source.buffer = sample.buffer;
  applyBendAutomationToRate(source.playbackRate, baseRate, startTime, noteDuration, bendSegments);
  applyVibratoAutomation(source.detune, startTime, noteDuration, vibrato);

  const needsSustainLoop =
    Boolean(bendSegments?.length || vibrato?.length) && sample.buffer.duration > 0.12;
  // Codec/resampling rounding can place the source loop end a fraction of a
  // millisecond beyond the decoded buffer. Keep that loop rather than cutting
  // off a held note; genuinely invalid source points are rejected by the audit.
  if (sample.loop && sample.loop[0] < sample.buffer.duration && sample.loop[1] <= sample.buffer.duration + 0.002) {
    source.loop = true;
    source.loopStart = sample.loop[0];
    source.loopEnd = Math.min(sample.loop[1], sample.buffer.duration);
  } else if (needsSustainLoop) {
    const loopEnd = Math.max(0.08, sample.buffer.duration - 0.02);
    const loopStart = Math.max(0.02, Math.min(loopEnd - 0.04, sample.buffer.duration * 0.35));
    if (loopEnd - loopStart >= 0.03) {
      source.loop = true;
      source.loopStart = loopStart;
      source.loopEnd = loopEnd;
    }
  }

  const amp = ctx.createGain();
  const peak = Math.max(0, gain * instrument.option.gain * (sample.gain ?? 1));
  amp.gain.setValueAtTime(0, startTime);
  amp.gain.linearRampToValueAtTime(peak, startTime + 0.005);
  amp.gain.setValueAtTime(peak, Math.max(startTime + 0.005, releaseStart));
  amp.gain.linearRampToValueAtTime(0, releaseEnd);

  source.connect(amp);
  amp.connect(destination);
  source.start(startTime);
  source.stop(releaseEnd + 0.02);
};
