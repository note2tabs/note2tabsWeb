import {
  DRUM_VOICES,
  type DrumVoice,
  type DrumVoiceId,
} from "./gteDrums";

export type PreparedDrumKit = Map<DrumVoiceId, AudioBuffer>;

const sampleData = new Map<string, Promise<ArrayBuffer | null>>();
const preparedByContext = new WeakMap<AudioContext, Promise<PreparedDrumKit>>();
let previewContext: AudioContext | null = null;

export const DRUM1_SAMPLE_URLS = Object.fromEntries(
  DRUM_VOICES.map((voice) => [
    voice.id,
    `/sound_samples/drum1/${voice.sampleStem}.opus`,
  ])
) as Record<DrumVoiceId, string>;

const fetchCandidate = (url: string) => {
  const cached = sampleData.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null);
  sampleData.set(url, pending);
  return pending;
};

const loadVoiceSample = async (ctx: AudioContext, voice: DrumVoice) => {
  const encoded = await fetchCandidate(DRUM1_SAMPLE_URLS[voice.id]);
  if (!encoded) return null;
  try {
    return await ctx.decodeAudioData(encoded.slice(0));
  } catch {
    return null;
  }
};

export const prepareDrumKit = (ctx: AudioContext) => {
  const cached = preparedByContext.get(ctx);
  if (cached) return cached;
  const pending = Promise.all(
    DRUM_VOICES.map(async (voice) => [voice.id, await loadVoiceSample(ctx, voice)] as const)
  ).then((entries) => {
    const kit: PreparedDrumKit = new Map();
    entries.forEach(([voiceId, buffer]) => {
      if (buffer) kit.set(voiceId, buffer);
    });
    return kit;
  });
  preparedByContext.set(ctx, pending);
  return pending;
};

export const schedulePreparedDrumHit = (input: {
  ctx: AudioContext;
  destination: AudioNode;
  kit: PreparedDrumKit;
  voiceId: DrumVoiceId;
  gain: number;
  startTime: number;
}) => {
  const buffer = input.kit.get(input.voiceId);
  if (!buffer) return;
  const source = input.ctx.createBufferSource();
  const amp = input.ctx.createGain();
  const start = Math.max(input.ctx.currentTime, input.startTime);
  source.buffer = buffer;
  amp.gain.setValueAtTime(Math.max(0, input.gain), start);
  source.connect(amp);
  amp.connect(input.destination);
  source.start(start);
};

export const previewDrumVoice = async (voiceId: DrumVoiceId, gain = 0.7) => {
  if (typeof window === "undefined") return;
  previewContext ??= new AudioContext();
  if (previewContext.state === "suspended") await previewContext.resume();
  const kit = await prepareDrumKit(previewContext);
  schedulePreparedDrumHit({
    ctx: previewContext,
    destination: previewContext.destination,
    kit,
    voiceId,
    gain,
    startTime: previewContext.currentTime,
  });
};
