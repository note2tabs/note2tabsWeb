import { versionedSampleUrl } from "./gteSampleUrl";

const encodedSamples = new Map<string, Promise<ArrayBuffer>>();

function supportsOggOpus() {
  return typeof document === "undefined" ||
    document.createElement("audio").canPlayType('audio/ogg; codecs="opus"') !== "";
}

export function playbackSampleUrl(opusUrl: string) {
  return supportsOggOpus() ? opusUrl : mp3SampleUrl(opusUrl);
}

function mp3SampleUrl(opusUrl: string) {
  return versionedSampleUrl(opusUrl.split("?")[0].replace(/\.opus$/, ".mp3"));
}

/** Share successful/in-flight downloads, but never poison retries with a rejection. */
export function fetchPlaybackSample(url: string): Promise<ArrayBuffer> {
  const cached = encodedSamples.get(url);
  if (cached) return cached;
  const pending = fetch(url).then(async response => {
    if (!response.ok) throw new Error(`Could not load instrument sample ${url}: ${response.status}`);
    return response.arrayBuffer();
  }).catch(error => {
    if (encodedSamples.get(url) === pending) encodedSamples.delete(url);
    throw error;
  });
  encodedSamples.set(url, pending);
  return pending;
}

export async function decodePlaybackSample(ctx: AudioContext, opusUrl: string): Promise<AudioBuffer> {
  const selected = playbackSampleUrl(opusUrl);
  const encoded = await fetchPlaybackSample(selected);
  try {
    // decodeAudioData can detach its input; preserve the shared encoded bytes.
    return await ctx.decodeAudioData(encoded.slice(0));
  } catch (error) {
    // Capability detection is imperfect. Try the compatible format on decode failure,
    // but let download failures surface so a user retry can fetch again.
    if (selected !== opusUrl) throw error;
    const fallback = await fetchPlaybackSample(mp3SampleUrl(opusUrl));
    return ctx.decodeAudioData(fallback.slice(0));
  }
}
