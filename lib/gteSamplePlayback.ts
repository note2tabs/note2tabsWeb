import {
  DEFAULT_TRACK_INSTRUMENT_ID,
  getTrackInstrumentOption,
  getTrackInstrumentOptions,
  normalizeTrackInstrumentId,
  type TrackInstrumentOption,
  type TrackSampleDefinition,
} from "./gteInstrumentManifest";

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
  kind: "opus";
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
  bendSegments?: Array<{
    holdSec: number;
    bendSec: number;
    targetCents: number;
  }>;
  slideSegments?: Array<{
    holdSec: number;
    slideSec: number;
    targetCents: number;
  }>;
};

const sampleDataPromise = new Map<string, Promise<ArrayBuffer>>();
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

const fetchSampleData = (url: string) => {
  const cached = sampleDataPromise.get(url);
  if (cached) return cached;
  const pending = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Could not load guitar sample ${url}: ${response.status}`);
    }
    return response.arrayBuffer();
  });
  sampleDataPromise.set(url, pending);
  return pending;
};

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

const normalizeSlideSegments = (
  segments: ScheduledTrackNote["slideSegments"],
  duration: number
) => {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const safeDuration = Math.max(0, duration);
  return segments
    .map((segment) => ({
      holdSec: clamp(toFiniteNumber(segment.holdSec, 0), 0, safeDuration),
      slideSec: clamp(toFiniteNumber(segment.slideSec, 0), 0, safeDuration),
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

const applySlideAutomationToRate = (
  param: AudioParam,
  baseValue: number,
  startTime: number,
  duration: number,
  slideSegments?: ScheduledTrackNote["slideSegments"]
) => {
  const segments = normalizeSlideSegments(slideSegments, duration);
  param.setValueAtTime(baseValue, startTime);
  let currentCents = 0;
  segments.forEach((segment) => {
    const holdAt = startTime + segment.holdSec;
    const slideEndAt = startTime + Math.min(duration, segment.holdSec + segment.slideSec);
    param.setValueAtTime(baseValue * centsToRatio(currentCents), holdAt);
    const semitoneDelta = Math.round((segment.targetCents - currentCents) / 100);
    const stepCount = Math.max(1, Math.abs(semitoneDelta));
    for (let step = 1; step <= stepCount; step += 1) {
      const ratio = step / stepCount;
      const stepTime = holdAt + (slideEndAt - holdAt) * ratio;
      const stepCents = currentCents + semitoneDelta * 100 * ratio;
      param.setValueAtTime(baseValue * centsToRatio(stepCents), stepTime);
    }
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
  instrumentId?: string | null
): Promise<PreparedTrackInstrument> => {
  const option = getTrackInstrumentOption(instrumentId);
  let contextCache = preparedByContext.get(ctx);
  if (!contextCache) {
    contextCache = new Map();
    preparedByContext.set(ctx, contextCache);
  }
  const cached = contextCache.get(option.id);
  if (cached) return cached;

  const pending = Promise.all(
    option.samples.map(async (sample) => {
      const encoded = await fetchSampleData(sample.url);
      const buffer = await ctx.decodeAudioData(encoded.slice(0));
      return { ...sample, buffer };
    })
  ).then((samples) => ({ kind: "opus" as const, option, samples }));
  contextCache.set(option.id, pending);
  return pending;
};

export const warmTrackInstrument = async (instrumentId?: string | null) => {
  if (typeof window === "undefined") return;
  const option = getTrackInstrumentOption(instrumentId);
  try {
    await Promise.all(option.samples.map((sample) => fetchSampleData(sample.url)));
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
  slideSegments,
}: ScheduledTrackNote) => {
  if (!Number.isFinite(midi) || midi <= 0) return;
  const sample = findNearestTrackSample(instrument.samples, midi);
  if (!sample) return;

  const noteDuration = Math.max(0.05, duration);
  const release = 0.08;
  const releaseStart = startTime + noteDuration;
  const releaseEnd = releaseStart + release;
  const baseRate = Math.pow(2, (midi - sample.midi) / 12);

  const source = ctx.createBufferSource();
  source.buffer = sample.buffer;
  applyBendAutomationToRate(source.playbackRate, baseRate, startTime, noteDuration, bendSegments);
  applySlideAutomationToRate(source.playbackRate, baseRate, startTime, noteDuration, slideSegments);

  const needsSustainLoop =
    (Boolean(bendSegments?.length) || Boolean(slideSegments?.length)) && sample.buffer.duration > 0.12;
  if (needsSustainLoop) {
    const loopEnd = Math.max(0.08, sample.buffer.duration - 0.02);
    const loopStart = Math.max(0.02, Math.min(loopEnd - 0.04, sample.buffer.duration * 0.35));
    if (loopEnd - loopStart >= 0.03) {
      source.loop = true;
      source.loopStart = loopStart;
      source.loopEnd = loopEnd;
    }
  }

  const amp = ctx.createGain();
  const peak = Math.max(0, gain * instrument.option.gain);
  amp.gain.setValueAtTime(0, startTime);
  amp.gain.linearRampToValueAtTime(peak, startTime + 0.005);
  amp.gain.setValueAtTime(peak, Math.max(startTime + 0.005, releaseStart));
  amp.gain.linearRampToValueAtTime(0, releaseEnd);

  source.connect(amp);
  amp.connect(destination);
  source.start(startTime);
  source.stop(releaseEnd + 0.02);
};
