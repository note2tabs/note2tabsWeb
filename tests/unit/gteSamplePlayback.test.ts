import { describe, expect, it, vi } from "vitest";
import rawManifest from "../../public/sound_samples/manifest.json";
import {
  DEFAULT_TRACK_INSTRUMENT_ID,
  findNearestTrackSample,
  getTrackInstrumentOptions,
  normalizeTrackInstrumentId,
  schedulePreparedTrackNote,
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
      "organ", "accordion", "saxophone", "xylophone", "ukulele", "harp", "banjo",
      "SViolinVib", "TrumpetSus", "TromboneSus", "FHornSus", "FluteSusNV",
      "harmonica", "harpsichord",
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
      expect(sample.url.split("?")[0]).toBe(`/sound_samples/${id}/G%232.opus`);
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

  it("uses source loop points and tuning for sustained samples", () => {
    const param = () => ({ setValueAtTime: () => {}, linearRampToValueAtTime: () => {} });
    const source: any = { playbackRate: { ...param(), setValueAtTime: vi.fn() }, detune: param(), connect: () => {}, start: () => {}, stop: () => {} };
    const ctx: any = { createBufferSource: () => source, createGain: () => ({ gain: param(), connect: () => {} }) };
    schedulePreparedTrackNote({ ctx, destination: {} as AudioNode, midi: 60, gain: 1, startTime: 0, duration: 5,
      instrument: { kind: "opus", option: { id: "test", label: "Test", kind: "opus", gain: 1, samples: [] },
        samples: [{ midi: 60, url: "test", buffer: { duration: 3 } as AudioBuffer, loop: [0.5, 2], tuning: -20 }] } });
    expect(source.loop).toBe(true);
    expect([source.loopStart, source.loopEnd]).toEqual([0.5, 2]);
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(Math.pow(2, -20 / 1200)), 0);
  });
});

it("keeps source sustain loops despite sub-millisecond decoder duration rounding", () => {
 const param=()=>({setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()});
 const source:any={playbackRate:param(),detune:param(),connect:vi.fn(),start:vi.fn(),stop:vi.fn()};
 const ctx:any={createBufferSource:()=>source,createGain:()=>({gain:param(),connect:vi.fn()})};
 schedulePreparedTrackNote({ctx,destination:{} as AudioNode,midi:60,gain:1,startTime:0,duration:5,
 instrument:{kind:"opus",option:{id:"test",label:"Test",kind:"opus",gain:1,samples:[]},samples:[{midi:60,url:"test",buffer:{duration:2.9998} as AudioBuffer,loop:[.5,3]}]}});
 expect(source.loop).toBe(true);expect(source.loopEnd).toBe(2.9998);
});
