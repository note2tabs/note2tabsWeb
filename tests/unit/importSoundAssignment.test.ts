import { expect, it } from "vitest";
import { importedInstrument } from "../../lib/gteImportedInstrument";
import { getTrackInstrumentOption, normalizeTrackInstrumentId } from "../../lib/gteInstrumentManifest";

it("plays legacy saved piano tracks with actual recorded piano samples", () => {
  const sound = getTrackInstrumentOption("gm:piano");
  expect(sound.id).toBe("upright_piano");
  expect(sound.kind).toBe("opus");
  expect(sound.samples.length).toBeGreaterThan(0);
});
it.each([4,5])("assigns electric piano program %s to recorded piano, not a generic oscillator", program => {
  const imported = importedInstrument({program, name: "Electric Piano", instrumentId: "gm:instrument", trackType: "tab"});
  expect(imported).toEqual({instrumentType: "notation", instrumentId: "upright_piano"});
  expect(getTrackInstrumentOption(imported.instrumentId).kind).toBe("opus");
});
it.each([[24,"acoustic"],[25,"acoustic"],[26,"jazz"],[27,"electric"],[28,"electric"],[29,"electric_overdrive"],[30,"electric_distortion"],[31,"electric"]])("uses the guitar program %s instead of a stale default sound", (program, sound) => {
  expect(importedInstrument({program, name: "Guitar", instrumentId: "acoustic"})).toEqual({instrumentType: "guitar-tab", instrumentId: sound});
});
it("keeps explicit acoustic selection tied to the real acoustic samples", () => {
  const sound=getTrackInstrumentOption("acoustic");
  expect(sound.kind).toBe("opus");
  expect(sound.samples.every(s=>s.url.startsWith('/sound_samples/acoustic/'))).toBe(true);
  expect(normalizeTrackInstrumentId("acoustic")).toBe("acoustic");
});
it("keeps presentation independent of the imported guitar sound", () => {
  expect(importedInstrument({program: 30, instrumentType: "notation", instrumentId: "acoustic"}))
    .toEqual({instrumentType: "notation", instrumentId: "electric_distortion"});
});
it("uses the drum kit even if an old import supplied a guitar sound", () => {
  expect(importedInstrument({trackType: "drums", instrumentId: "acoustic"}))
    .toEqual({instrumentType: "drums", instrumentId: "drum1"});
});

it("keeps the selected sound through import metadata and a legacy-server save/reload", async () => {
  const {serializeNotationPayload, restoreNotationSnapshot} = await import("../../lib/gteNotationPersistence");
  const {prepareTrackInstrument, schedulePreparedTrackNote} = await import("../../lib/gteSamplePlayback");
  const {vi} = await import("vitest");
  const imported=importedInstrument({program: 4, name: "Electric Piano", instrumentId: "gm:instrument"});
  const original={id:"test",name:"Electric Piano",program:4,editorType:"tab",...imported,framesPerMessure:480,fps:240,totalFrames:480,
    notes:[],chords:[],cutPositionsWithCoords:[],optimalsByTime:{},chordEditor:{instrumentType:imported.instrumentType,instrumentSound:imported.instrumentId}} as import("../../types/gte").EditorSnapshot;
  const wire=serializeNotationPayload(original) as typeof original;
  delete wire.instrumentType;
  const restored=restoreNotationSnapshot(wire);
  expect(restored).toMatchObject({name:"Electric Piano",instrumentId:"upright_piano",program:4});
  const createOscillator=vi.fn(()=>{throw Error("Unexpected synth");});
  const rate={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};
  const source={playbackRate:rate,connect:vi.fn(),start:vi.fn(),stop:vi.fn()};
  const gain={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};
  const ctx={decodeAudioData:vi.fn().mockResolvedValue({duration:1,length:48000}),createOscillator,createBufferSource:()=>source,createGain:()=>({gain,connect:vi.fn()})} as unknown as AudioContext;
  const fetcher=vi.fn().mockImplementation(()=>Promise.resolve(new Response(new Uint8Array([1]))));
  vi.stubGlobal("fetch",fetcher);
  try {
    const instrument=await prepareTrackInstrument(ctx,restored.instrumentId);
    schedulePreparedTrackNote({ctx,destination:{} as AudioNode,instrument,midi:60,gain:.7,startTime:0,duration:.5});
    expect(createOscillator).not.toHaveBeenCalled();
    expect(source.start).toHaveBeenCalled();
    expect(fetcher.mock.calls.every(([url])=>String(url).startsWith('/sound_samples/upright_piano/'))).toBe(true);
  } finally {vi.unstubAllGlobals();}
});

it.each([["gm:bass","bass_overdrive"],["gm:synth-lead","synth_lead"],["gm:synth-pad","synth_lead_sweepPad"]])("plays legacy %s with its available recorded sound", (legacy,sampled) => {
  const option=getTrackInstrumentOption(legacy);
  expect(option.id).toBe(sampled);
  expect(option.kind).toBe("opus");
  expect(option.samples.length).toBeGreaterThan(0);
});
it.each(Array.from({length:8},(_,i)=>32+i))("routes bass program %s to the temporary user-approved overdrive sample bank", program => {
  expect(importedInstrument({program,instrumentId:"gm:bass",name:"Electric Bass",trackType:"bass"}))
    .toEqual({instrumentType:"bass-tab",instrumentId:"bass_overdrive"});
});
it("does not let a stale bass type override a valid piano program", () => {
  expect(importedInstrument({program:4,instrumentId:"acoustic",trackType:"bass",name:"Electric Piano"}))
    .toEqual({instrumentType:"notation",instrumentId:"upright_piano"});
});
it.each([["Acoustic Guitar","acoustic"],["Electric Guitar","electric"],["Distorted Guitar","electric_distortion"],["Electric Piano","upright_piano"],["Acoustic Bass","bass_overdrive"],["Electric Bass","bass_overdrive"]])("uses the %s name when a legacy import has no program and a generic preset", (name,instrumentId) => {
  expect(importedInstrument({name,instrumentId:"gm:instrument",trackType:"tab"}).instrumentId).toBe(instrumentId);
});
