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
it.each(Array.from({length:7},(_,i)=>33+i))("routes bass program %s to the temporary user-approved overdrive sample bank", program => {
  expect(importedInstrument({program,instrumentId:"gm:bass",name:"Electric Bass",trackType:"bass"}))
    .toEqual({instrumentType:"bass-tab",instrumentId:"bass_overdrive"});
});
it("does not let a stale bass type override a valid piano program", () => {
  expect(importedInstrument({program:4,instrumentId:"acoustic",trackType:"bass",name:"Electric Piano"}))
    .toEqual({instrumentType:"notation",instrumentId:"upright_piano"});
});
it.each([["Acoustic Guitar","acoustic"],["Electric Guitar","electric"],["Distorted Guitar","electric_distortion"],["Electric Piano","upright_piano"],["Acoustic Bass","bass_acoustic"],["Electric Bass","bass_overdrive"]])("uses the %s name when a legacy import has no program and a generic preset", (name,instrumentId) => {
  expect(importedInstrument({name,instrumentId:"gm:instrument",trackType:"tab"}).instrumentId).toBe(instrumentId);
});

const newBankPrograms: Array<[number,string]> = [[6,"harpsichord"],[13,"xylophone"],[16,"organ"],[17,"organ"],[18,"organ"],[19,"organ"],[20,"organ"],[21,"accordion"],[22,"harmonica"],[23,"accordion"],[40,"SViolinVib"],[46,"harp"],[56,"TrumpetSus"],[57,"TromboneSus"],[60,"FHornSus"],[64,"saxophone"],[65,"saxophone"],[66,"saxophone"],[67,"saxophone"],[72,"FluteSusNV"],[73,"FluteSusNV"],[105,"banjo"]];
it.each(newBankPrograms)("routes GM %s through stored transcription, transport and restore to %s", async (program, instrumentId) => {
  const { normalizeTranscriberTracks } = await import("../../lib/storedTabs");
  const { pitchedImportTransport } = await import("../../lib/gteNotationImport");
  const { serializeNotationPayload, restoreNotationSnapshot } = await import("../../lib/gteNotationPersistence");
  const segments = [{start_time_s:.125,end_time_s:.625,pitch_midi:60,amplitude:.8}];
  const tracks = normalizeTranscriberTracks([{program,name:"Imported part",instrumentId:"acoustic",trackType:"tab",segments}]);
  expect(tracks[0]).toMatchObject({program,instrumentId,instrumentType:"notation",trackType:"tab"});
  expect(getTrackInstrumentOption(instrumentId).samples.length).toBeGreaterThan(0);
  const transport = pitchedImportTransport({tracks,segmentGroups:[segments]});
  expect(transport.tracks[0].instrumentId).toBe("gm:piano");
  expect(tracks[0].instrumentId).toBe(instrumentId);
  const lane = {id:"new",...tracks[0],editorType:"tab",notes:[],chords:[],framesPerMessure:480,fps:240,totalFrames:480,cutPositionsWithCoords:[],optimalsByTime:{},chordEditor:{instrumentType:"notation",instrumentSound:instrumentId}} as import("../../types/gte").EditorSnapshot;
  const wire = serializeNotationPayload(lane) as typeof lane;
  delete wire.instrumentType;
  expect(restoreNotationSnapshot(wire).instrumentId).toBe(instrumentId);
});
it.each([["Ukulele","ukulele"],["Banjo","banjo"],["Accordion","accordion"],["Harmonica","harmonica"],["Harp","harp"],["Harpsichord","harpsichord"],["Organ","organ"],["Xylophone","xylophone"],["Violin","SViolinVib"],["Trumpet","TrumpetSus"],["Trombone","TromboneSus"],["French Horn","FHornSus"],["Tenor Saxophone","saxophone"],["Flute","FluteSusNV"]])("uses named %s without a valid program", (name,instrumentId) => {
  expect(importedInstrument({name,program:null,instrumentId:"gm:instrument",trackType:"tab"})).toEqual({instrumentType:"notation",instrumentId});
});
it("does not turn missing programs into piano or a bass clarinet into bass tab", async () => {
 const {normalizeTranscriberTracks}=await import("../../lib/storedTabs");
 const segments=[{start_time_s:0,end_time_s:1,pitch_midi:60}];
 const tracks=normalizeTranscriberTracks([{name:"Flute",program:null,segments},{name:"Bass clarinet",program:71,segments}]);
 expect(tracks[0].instrumentId).toBe("FluteSusNV"); expect(tracks[0].program).toBeUndefined();
 expect(tracks[1]).toMatchObject({instrumentType:"notation",trackType:"tab",program:71});
});

it.each(["acoustic","gm:strings","gm:instrument"])("replaces stale generic %s with the named sampled instrument", instrumentId=>{
 expect(importedInstrument({name:"Flute",trackType:"tab",instrumentId})).toEqual({instrumentType:"notation",instrumentId:"FluteSusNV"});
});

it.each([[32,"bass-tab","bass_acoustic"],[43,"notation","bass_upright"]])("uses the distinct sampled bass for program %s", (program,instrumentType,instrumentId)=>{
 expect(importedInstrument({program,instrumentId:"acoustic",name:"Imported bass"})).toEqual({instrumentType,instrumentId});
 expect(getTrackInstrumentOption(instrumentId).samples.length).toBeGreaterThan(0);
});
it.each(["Upright Bass","Double Bass","Contrabass"])("imports named %s as upright bass notation", name=>{
 expect(importedInstrument({name,trackType:"bass"})).toEqual({instrumentType:"notation",instrumentId:"bass_upright"});
});

it.each([["bass_acoustic","bass-tab",32],["bass_upright","notation",43]])("retains %s across legacy transport/save/reload", async (instrumentId,instrumentType,program)=>{
 const {serializeNotationPayload,restoreNotationSnapshot}=await import("../../lib/gteNotationPersistence");
 const {normalizeTranscriberTracks}=await import("../../lib/storedTabs");
 const tracks=normalizeTranscriberTracks([{program,name:"Bass",instrumentId:"gm:bass",trackType:"bass",segments:[{start_time_s:0,end_time_s:.5,pitch_midi:36}]}]);
 expect(tracks[0]).toMatchObject({instrumentId,instrumentType});
 const lane={id:"bass",...tracks[0],editorType:instrumentType==="notation"?"tab":"bass",notes:[],chords:[],framesPerMessure:480,fps:240,totalFrames:480,cutPositionsWithCoords:[],optimalsByTime:{},chordEditor:{instrumentType,instrumentSound:instrumentId}} as import("../../types/gte").EditorSnapshot;
 const wire=serializeNotationPayload(lane) as typeof lane;delete wire.instrumentType;
 if(instrumentType==="bass-tab")wire.instrumentId="bass_overdrive";
 expect(restoreNotationSnapshot(wire)).toMatchObject({instrumentId,instrumentType,program});
});
