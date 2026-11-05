import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/gteInstrumentManifest", () => ({
  DEFAULT_TRACK_INSTRUMENT_ID: "test", getTrackInstrumentOptions: () => [], normalizeTrackInstrumentId: (id: string) => id,
  getTrackInstrumentOption: () => ({id: "test", kind: "opus", gain: 1, samples: [{midi: 60, url: "/sound_samples/test/c4.opus"}]}),
}));
const buffer = {} as AudioBuffer;
const context = (decode = vi.fn().mockResolvedValue(buffer)) => ({decodeAudioData: decode}) as unknown as AudioContext;
const response = (value: number) => new Response(new Uint8Array([value]));
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("sample playback recovery", () => {
  it("retries a failed sample download on the same audio context", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, {status: 503})).mockImplementation(() => Promise.resolve(response(1)));
    vi.stubGlobal("fetch", fetcher);
    const {prepareTrackInstrument} = await import("../../lib/gteSamplePlayback");
    const ctx = context();
    await expect(prepareTrackInstrument(ctx, "test")).rejects.toThrow();
    expect((await prepareTrackInstrument(ctx, "test")).samples).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("uses MP3 when native Opus decoding is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(response(url.includes(".mp3") ? 2 : 1))));
    const decode = vi.fn(async (data: ArrayBuffer) => {
      if (new Uint8Array(data)[0] === 1) throw new DOMException("Unsupported format", "EncodingError");
      return buffer;
    });
    const {prepareTrackInstrument} = await import("../../lib/gteSamplePlayback");
    expect((await prepareTrackInstrument(context(decode), "test")).samples[0].buffer).toBe(buffer);
  });
});

it("skips Opus entirely when the browser reports it unsupported", async () => {
  vi.stubGlobal("document", {createElement: () => ({canPlayType: () => ""})});
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(2)));
  vi.stubGlobal("fetch", fetcher);
  const {prepareTrackInstrument} = await import("../../lib/gteSamplePlayback");
  await prepareTrackInstrument(context(), "test");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/sound_samples/test/c4.mp3");
});

it("shares in-flight and successful downloads, leaving Opus browsers on Opus", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(1)));
  vi.stubGlobal("fetch", fetcher);
  const {prepareTrackInstrument} = await import("../../lib/gteSamplePlayback");
  const ctx = context();
  const [a,b] = await Promise.all([prepareTrackInstrument(ctx, "test"), prepareTrackInstrument(ctx, "test")]);
  expect(a).toBe(b);
  await prepareTrackInstrument(context(), "test");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain(".opus");
});

it("evicts a network rejection so a new context can retry too", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockImplementation(() => Promise.resolve(response(1))));
  const {prepareTrackInstrument} = await import("../../lib/gteSamplePlayback");
  await expect(prepareTrackInstrument(context(), "test")).rejects.toThrow("offline");
  expect((await prepareTrackInstrument(context(), "test")).samples).toHaveLength(1);
});

it("does not retain a failed decode in the prepared-instrument cache", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(response(1))));
  const decode = vi.fn().mockRejectedValueOnce(new Error("decode opus failed"))
    .mockRejectedValueOnce(new Error("decode mp3 failed")).mockResolvedValue(buffer);
  const {prepareTrackInstrument} = await import("../../lib/gteSamplePlayback");
  const ctx = context(decode);
  await expect(prepareTrackInstrument(ctx, "test")).rejects.toThrow("decode mp3 failed");
  expect((await prepareTrackInstrument(ctx, "test")).samples).toHaveLength(1);
});

it("recovers drum downloads instead of caching a permanently silent kit", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 503}));
  vi.stubGlobal("fetch", fetcher);
  const {prepareDrumKit} = await import("../../lib/gteDrumPlayback");
  const ctx = context();
  await expect(prepareDrumKit(ctx)).rejects.toThrow("503");
  fetcher.mockImplementation(() => Promise.resolve(response(1)));
  const kit = await prepareDrumKit(ctx);
  expect(kit.size).toBe(9);
  expect(kit.get("kick")).toBe(buffer);
});

it("loads every drum voice in the compatible format", async () => {
  vi.stubGlobal("document", {createElement: () => ({canPlayType: () => ""})});
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(2)));
  vi.stubGlobal("fetch", fetcher);
  const {prepareDrumKit} = await import("../../lib/gteDrumPlayback");
  expect((await prepareDrumKit(context())).size).toBe(9);
  expect(fetcher.mock.calls.every(([url]) => url.includes(".mp3"))).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(6); // several voices share a recording
});
