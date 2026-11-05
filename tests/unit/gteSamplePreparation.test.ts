import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
beforeEach(()=>vi.resetModules());afterEach(()=>vi.unstubAllGlobals());
const context=()=>({decodeAudioData:vi.fn(async()=>({length:1}))}) as any;
describe("targeted instrument preparation",()=>{
 it("uses the exact same nearest samples, decoding each only once across subsets",async()=>{
  const fetch=vi.fn(async()=>new Response(new Uint8Array([1])));vi.stubGlobal("fetch",fetch);
  const {prepareTrackInstrument,findNearestTrackSample,getTrackInstrumentOptions}=await import("../../lib/gteSamplePlayback");
  const bank=getTrackInstrumentOptions()[0],ctx=context(),pitches=[60,61,64,60];
  const prepared=await prepareTrackInstrument(ctx,bank.id,pitches);
  const expected=[...new Set(pitches.map(pitch=>findNearestTrackSample(bank.samples,pitch)!.url))];
  expect(fetch).toHaveBeenCalledTimes(expected.length);expect(ctx.decodeAudioData).toHaveBeenCalledTimes(expected.length);
  for(const pitch of pitches)expect(findNearestTrackSample(prepared.samples,pitch)!.url).toBe(findNearestTrackSample(bank.samples,pitch)!.url);
  await prepareTrackInstrument(ctx,bank.id,[64]);expect(ctx.decodeAudioData).toHaveBeenCalledTimes(expected.length);
  const other=context();await prepareTrackInstrument(other,bank.id,pitches);expect(fetch).toHaveBeenCalledTimes(expected.length);expect(other.decodeAudioData).toHaveBeenCalledTimes(expected.length);
 });
 it("retries a failed download without reloading the page",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(new Response(new Uint8Array([1])));vi.stubGlobal("fetch",fetch);
  const {prepareTrackInstrument}=await import("../../lib/gteSamplePlayback");const ctx=context();
  await expect(prepareTrackInstrument(ctx,"acoustic",[60])).rejects.toThrow("503");
  expect((await prepareTrackInstrument(ctx,"acoustic",[60])).samples).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("retries failed decoding while reusing the downloaded bytes",async()=>{
  const fetch=vi.fn(async()=>new Response(new Uint8Array([1])));vi.stubGlobal("fetch",fetch);
  const {prepareTrackInstrument}=await import("../../lib/gteSamplePlayback");const ctx=context();ctx.decodeAudioData.mockRejectedValueOnce(new Error("decode")).mockRejectedValueOnce(new Error("decode"));
  await expect(prepareTrackInstrument(ctx,"acoustic",[60])).rejects.toThrow("decode");
  expect((await prepareTrackInstrument(ctx,"acoustic",[60])).samples).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(2);expect(ctx.decodeAudioData).toHaveBeenCalledTimes(3);
 });
});

it("loads only the requested new-bank roots and reuses their decoded samples", async()=>{
 const fetch=vi.fn(async()=>new Response(new Uint8Array([1])));vi.stubGlobal("fetch",fetch);
 const {prepareTrackInstrument,getTrackInstrumentOptions,findNearestTrackSample}=await import("../../lib/gteSamplePlayback");
 const ctx=context();
 for(const bank of getTrackInstrumentOptions().filter(b=>b.family)) {
  const pitches=[48,60,64,72,64];const before=fetch.mock.calls.length;
  const prepared=await prepareTrackInstrument(ctx,bank.id,pitches);
  const needed=new Set(pitches.map(p=>findNearestTrackSample(bank.samples,p)!.url));
  expect(fetch.mock.calls.length-before,bank.id).toBe(needed.size);
  expect(prepared.samples.length,bank.id).toBe(needed.size);
  expect(prepared.kind).toBe("opus");
  await prepareTrackInstrument(ctx,bank.id,[64]);expect(fetch.mock.calls.length-before,bank.id).toBe(needed.size);
  for(const sample of prepared.samples) {
   const definition=bank.samples.find(s=>s.midi===sample.midi)!;
   expect(sample.loop).toEqual(definition.loop); expect(sample.gain).toBe(definition.gain);
  }
 }
});
