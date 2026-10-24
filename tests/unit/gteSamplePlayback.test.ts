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

  it("only offers sounds with dedicated samples", () => {
    const options = getTrackInstrumentOptions();
    expect(options.map((option) => option.id)).toEqual([
      "acoustic",
      "jazz",
      "electric",
      "electric_overdrive",
      "electric_distortion",
      "bass_overdrive",
      "upright_piano",
      "grand_piano",
      "synth_lead_bowed",
      "synth_lead_new_age",
      "synth_lead_sweepPad",
      "synth_lead",
    ]);
    expect(
      options
        .filter((option) => option.kind === "opus")
        .flatMap((option) => option.samples)
        .every((sample) => !sample.url.includes("/mute_"))
    ).toBe(true);
    expect(options.every((option) => option.kind === "opus" && option.samples.length > 0)).toBe(true);
    expect(normalizeTrackInstrumentId("gm:instrument")).toBe("gm:instrument");
  });

  it("maps old sound choices to the closest Opus instrument", () => {
    expect(normalizeTrackInstrumentId("builtin:sine")).toBe("acoustic");
    expect(normalizeTrackInstrumentId("jazz-guitar")).toBe("jazz");
    expect(normalizeTrackInstrumentId("clean-guitar")).toBe("electric");
    expect(normalizeTrackInstrumentId("distortion-guitar")).toBe("electric_distortion");
  });

  it("encodes sharp-note filenames so they are not URL fragments", () => {
    for (const id of ["synth_lead_sweepPad", "synth_lead_new_age"]) {
      const sample = getTrackInstrumentOptions().find(option => option.id === id)!.samples.find(sample => sample.midi === 44)!;
      expect(sample.url).toBe(`/sound_samples/${id}/G%232.opus`);
      const url = new URL(sample.url, "http://localhost:3000");
      expect(url.hash).toBe("");
      expect(decodeURIComponent(url.pathname)).toBe(`/sound_samples/${id}/G#2.opus`);
    }
  });

  it("selects the nearest recorded pitch and prefers the lower note on a tie", () => {
    const samples = [{ midi: 40 }, { midi: 42 }, { midi: 45 }];
    expect(findNearestTrackSample(samples, 44)?.midi).toBe(45);
    expect(findNearestTrackSample(samples, 41)?.midi).toBe(40);
  });
});
