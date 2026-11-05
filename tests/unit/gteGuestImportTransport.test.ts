// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gteApi } from "../../lib/gteApi";
import { createGuestSnapshot } from "../../lib/gteGuestDraft";
import { loadGuestImportDraft, saveGuestCanvasToAccount } from "../../lib/gteGuestImport";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";

// Real client + real notation/vibrato serializer. The fixture server deliberately
// strips fields the legacy backend stores in chordEditor metadata and truncates
// note timing as its integer note rows do. No customer database or email involved.
let saved: CanvasSnapshot;
let stored: CanvasSnapshot;
let requests: Array<{url:string;init:RequestInit}>;
let persisted: Map<string,EditorSnapshot>;
let omit: "notation" | "effects" | "loops" | undefined;
beforeEach(()=>{
 requests=[];omit=undefined;persisted=new Map([["ed-1",createGuestSnapshot("ed-1")]]);
 vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>{
  const url=String(input);requests.push({url,init});
  if(url==="/api/gte/editors" && init.method==="POST") return Response.json({editorId:"account-copy",snapshot:{name:"Saved song",editors:[createGuestSnapshot("ed-1")]}});
  if(url.endsWith("/snapshot")) {
   stored=JSON.parse(String(init.body)).snapshot;
   saved=JSON.parse(JSON.stringify(stored));
   saved.editors=saved.editors.map(lane=>{
    const previous=persisted.get(lane.id);
    const next={...lane};
    // This is the production _db_upsert_canvas_snapshot optimization: lane
    // metadata updates, but equal versions skip writing all note/chord rows.
    if(previous && previous.version===lane.version){next.notes=previous.notes;next.chords=previous.chords;}
    delete next.instrumentType;delete next.notation;
    next.notes=next.notes.map(n=>{
     const copy={...n,startTime:Math.trunc(n.startTime),length:Math.trunc(n.length)};
     delete copy.notationVoice;delete copy.notationStaff;delete copy.vibrato;delete copy.vibratoSettings;
     return copy;
    });
    if(omit==="notation" && next.chordEditor) delete next.chordEditor.notation;
    if(omit==="effects") next.noteEffects=[];
    if(omit==="loops") next.drumLoops=[];
    persisted.set(next.id,structuredClone(next));
    return next;
   });
   return Response.json({ok:true,snapshot:saved});
  }
  if(url.endsWith("/commit")) return Response.json({ok:true,snapshot:saved});
  if(url==="/api/gte/editors/account-copy") return Response.json(saved);
  throw new Error("Unexpected request: "+url);
 }));
});
afterEach(()=>{vi.unstubAllGlobals();});
function canvas(instrumentType: NonNullable<EditorSnapshot["instrumentType"]>): CanvasSnapshot {
 const lane=createGuestSnapshot("ed-1");
 lane.name="Track";lane.instrumentType=instrumentType;
 lane.editorType=instrumentType==="drums"?"drums":instrumentType==="bass-tab"?"bass":"tab";
 lane.instrumentId=instrumentType==="notation"?"upright_piano":instrumentType==="drums"?"drum1":instrumentType==="bass-tab"?"bass_overdrive":"acoustic";
 lane.notes=[{id:1,startTime:120,length:60,midiNum:64,tab:[0,0],optimals:[],vibrato:true,vibratoSettings:{cover:2,bend:.5,cyclesPerBeat:6}}];
 lane.chords=[{id:2,startTime:240,length:120,currentTabs:[[1,2],[2,2]],ogTabs:[[1,2],[2,2]],originalMidi:[61,57]}];
 if(instrumentType==="notation") {
  lane.notes[0]={...lane.notes[0],startTime:120.5,length:60.25,notationVoice:2,notationStaff:"treble"};
  lane.notation={rests:[{id:8,start:360,length:120,staff:"bass",voice:1,denominator:4,dotted:false}],ties:[],slurs:[]};
 }
 return {id:"local",name:"Song",keyBase:4,keyType:1,secondsPerBar:2,editors:[lane]};
}
describe("guest import client transport",()=>{
 it.each(["guitar-tab","bass-tab","drums","notation"] as const)("round-trips %s using the actual save serializer and fresh verification read",async type=>{
  const original=canvas(type),before=JSON.stringify(original);
  // Even a stale prefetched editor must not be used to verify this import.
  saved={...original,editors:[]};
  await gteApi.prefetchEditor("account-copy");
  await expect(saveGuestCanvasToAccount(original)).resolves.toBe("account-copy");
  expect(JSON.stringify(original)).toBe(before);
  expect(stored.editors).toHaveLength(1);
  expect(requests.at(-1)).toMatchObject({url:"/api/gte/editors/account-copy",init:{cache:"no-store"}});
  expect(requests.every(r=>r.url.startsWith("/api/gte/"))).toBe(true);
 });
 it("reproduces the database version collision that leaves a newly created tab blank",async()=>{
  const original=canvas("guitar-tab");
  await gteApi.createEditor();
  await gteApi.applySnapshot("account-copy",original);
  await gteApi.commitEditor("account-copy");
  const blank=await gteApi.getEditor("account-copy",{fresh:true}) as CanvasSnapshot;
  expect(blank.editors[0].notes).toHaveLength(0);
  expect(blank.editors[0].totalFrames).toBe(original.editors[0].totalFrames);
 });
 it("writes notes and chords when importing a guest version 1 over the new tab's version 1",async()=>{
  const original=canvas("guitar-tab");
  await saveGuestCanvasToAccount(original);
  expect(saved.editors[0].notes).toHaveLength(1);
  expect(saved.editors[0].chords).toHaveLength(1);
  expect(stored.editors[0].version).toBe(2);
 });
 it("accepts disabled vibrato as the same sound as an omitted backend flag",async()=>{
  const original=canvas("guitar-tab");original.editors[0].notes[0].vibrato=false;
  await expect(saveGuestCanvasToAccount(original)).resolves.toBe("account-copy");
 });
 it("round-trips a mixed guitar, bass, drum and piano project with every track intact",async()=>{
  const original=canvas("guitar-tab");
  original.editors=(["guitar-tab","bass-tab","drums","notation"] as const).map((type,index)=>({...canvas(type).editors[0],id:`ed-${index+1}`}));
  await expect(saveGuestCanvasToAccount(original)).resolves.toBe("account-copy");
  expect(stored.editors.map(l=>l.id)).toEqual(["ed-1","ed-2","ed-3","ed-4"]);
 });
 it("finds an untitled rests-only notation draft in server transport metadata",async()=>{
  const original=canvas("notation");original.name="Untitled";
  original.editors[0].notes=[];original.editors[0].chords=[];
  // Round-trip first to obtain the legacy transport representation.
  await saveGuestCanvasToAccount(original);
  const response=structuredClone(saved);
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(response)));
  expect((await loadGuestImportDraft())?.editors).toHaveLength(1);
 });
 it("detects lost piano metadata instead of accepting rounded timing and missing rests",async()=>{
  omit="notation";
  await expect(saveGuestCanvasToAccount(canvas("notation"))).rejects.toThrow("could not verify");
 });
 it("rejects lost connecting effects",async()=>{
  omit="effects";const original=canvas("guitar-tab");
  original.editors[0].notes.push({...original.editors[0].notes[0],id:3,startTime:180});
  original.editors[0].noteEffects=[{id:1,type:1,startNoteId:1,endNoteId:3,noteEffectLabel:"b"}];
  await expect(saveGuestCanvasToAccount(original)).rejects.toThrow("could not verify");
 });
 it("rejects lost drum loop regions",async()=>{
  omit="loops";const original=canvas("drums");
  original.editors[0].drumLoops=[{id:"loop",sourceStart:0,sourceEnd:480,loopEnd:960}];
  await expect(saveGuestCanvasToAccount(original)).rejects.toThrow("could not verify");
 });
});
