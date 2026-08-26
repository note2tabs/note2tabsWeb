import { describe, expect, it } from "vitest";
import rawManifest from "../../public/sound_samples/manifest.json";
import {
  DEFAULT_TRACK_INSTRUMENT_ID,
  findNearestTrackSample,
  getTrackInstrumentOptions,
  normalizeTrackInstrumentId,
} from "../../lib/gteSamplePlayback";

describe("Opus guitar sample playback", () => {
  it("uses the first manifest instrument as the default", () => {
    expect(DEFAULT_TRACK_INSTRUMENT_ID).toBe(rawManifest[0].id);
  });

  it("exposes playable sampled guitars and synthesized imported instruments", () => {
    const options = getTrackInstrumentOptions();
    expect(options.map((option) => option.id)).toEqual([
      "acoustic",
      "jazz",
      "electric",
      "electric_overdrive",
      "electric_distortion",
      "gm:piano",
      "gm:bass",
      "gm:strings",
      "gm:synth-lead",
      "gm:synth-pad",
      "gm:instrument",
    ]);
    expect(
      options
        .filter((option) => option.kind === "opus")
        .flatMap((option) => option.samples)
        .every((sample) => !sample.url.includes("/mute_"))
    ).toBe(true);
    expect(options.filter((option) => option.kind === "synth")).toHaveLength(6);
  });

  it("maps old sound choices to the closest Opus instrument", () => {
    expect(normalizeTrackInstrumentId("builtin:sine")).toBe("acoustic");
    expect(normalizeTrackInstrumentId("jazz-guitar")).toBe("jazz");
    expect(normalizeTrackInstrumentId("clean-guitar")).toBe("electric");
    expect(normalizeTrackInstrumentId("distortion-guitar")).toBe("electric_distortion");
  });

  it("selects the nearest recorded pitch and prefers the lower note on a tie", () => {
    const samples = [{ midi: 40 }, { midi: 42 }, { midi: 45 }];
    expect(findNearestTrackSample(samples, 44)?.midi).toBe(45);
    expect(findNearestTrackSample(samples, 41)?.midi).toBe(40);
  });
});
