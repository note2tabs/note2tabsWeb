import { describe,it,expect } from "vitest";
import { createStreamingReveal } from "../../lib/gteStreamingReveal";
import { ghostNotes } from "../../lib/gteStreamingGhosts";
import { completeStreamingCanvas } from "../../lib/gteStreamingCompletion";
import type { CanvasSnapshot } from "../../types/gte";
const source=():CanvasSnapshot=>({id:"ghost-test",secondsPerBar:2,editors:[{id:"guitar",instrumentType:"guitar-tab",fps:240,totalFrames:1920,framesPerMessure:480,timeSignature:4,notes:[0,120,240,480].map((startTime,index)=>({id:-index-1,startTime,length:60,midiNum:60+index,tab:[index,5+index],optimals:[]})),chords:[],cutPositionsWithCoords:[],optimalsByTime:{}}]});
describe("display-only streaming ghosts",()=>{
 it("shows a real translucent preview before putting a note in the musical score",()=>{
  const raw=source(), untouched=structuredClone(raw), reveal=createStreamingReveal({previewMs:300});
  reveal.receive(raw,false,8);
  expect(reveal.ghosts().guitar.some(note=>note.phase==="fake")).toBe(true);
  const pending=reveal.advance(2000)!;
  expect(pending.editors[0].notes).toHaveLength(0);
  const previews=reveal.ghosts().guitar.filter(note=>note.phase==="preview");
  expect(previews).toHaveLength(1); expect(previews[0]).toMatchObject({start:0,midi:60,tab:[0,5]});
  expect(reveal.advance(299)!.editors[0].notes).toHaveLength(0);
  const solid=reveal.advance(1)!;
  expect(solid.editors[0].notes.map(note=>note.id)).toEqual([-1]);
  expect(reveal.ghosts().guitar.some(note=>note.phase==="preview" && note.key==="n:-1")).toBe(false);
  expect(JSON.stringify(completeStreamingCanvas(pending,{tracks:[]}))).not.toContain('"phase"');
  expect(raw).toEqual(untouched);
 });
 it("keeps placeholders within 2.5 bars and stops them at the available watermark",()=>{
  const raw=source(),reveal=createStreamingReveal({previewMs:300}); reveal.receive(raw,false,8);
  reveal.advance();
  for(let i=0;i<8;i++) {
   reveal.advance(125);
   for(const ghost of reveal.ghosts().guitar.filter(note=>note.phase==="fake")) {
    expect(ghost.start/raw.editors[0].fps).toBeLessThanOrEqual(reveal.throughSeconds()+5);
    expect(ghost.start/raw.editors[0].fps).toBeLessThanOrEqual(8);
   }
  }
 });
 it("keeps a dense, stable varied pattern visible across a quiet stretch until new music arrives",()=>{
  const raw=source(); raw.editors[0].notes=raw.editors[0].notes.slice(0,1);
  const reveal=createStreamingReveal(); reveal.receive(raw,false,5); reveal.advance(); reveal.advance(500);
  const before=reveal.ghosts().guitar.filter(note=>note.phase==="fake");
  expect(before.length).toBeGreaterThan(30);
  expect(new Set(before.map(note=>note.length)).size).toBeGreaterThan(3);
  expect(new Set(before.map(note=>note.tab[0])).size).toBeGreaterThan(3);
  reveal.receive(raw,false,5); reveal.advance(5000);
  expect(reveal.ghosts().guitar.filter(note=>note.phase==="fake")).toEqual(before);
  const later=structuredClone(raw); later.editors[0].notes.push({...later.editors[0].notes[0],id:-99,startTime:960});
  reveal.receive(later,false,6); reveal.advance();
  expect(reveal.ghosts().guitar.filter(note=>note.phase==="fake").every(note=>note.start>960)).toBe(true);
  const lane=source().editors[0];expect(ghostNotes(lane,new Set(),0,5)).toEqual(ghostNotes(lane,new Set(),0,5));
 });
 it("does not clear one track's quiet stretch when another track produces notes",()=>{
  const raw=source();raw.editors[0].notes=raw.editors[0].notes.slice(0,1);
  raw.editors.push({...raw.editors[0],id:"piano",notes:[{...raw.editors[0].notes[0],id:-90,startTime:480}]});
  const reveal=createStreamingReveal();reveal.receive(raw,false,5);reveal.advance();
  const before=reveal.ghosts().guitar.filter(note=>note.phase==="fake");reveal.advance();
  expect(reveal.ghosts().guitar.filter(note=>note.phase==="fake")).toEqual(before);
 });
 it("holds completion for the real preview and clears all ghosts after the last solid note",()=>{
  const raw=source(),reveal=createStreamingReveal({previewMs:300}); reveal.receive(raw,true,8);
  reveal.advance(1500); expect(reveal.pending()).toBe(4);
  const final=reveal.advance(300)!;
  expect(reveal.pending()).toBe(0); expect(reveal.ghosts()).toEqual({}); expect(final).toEqual(raw);
  reveal.reset(); expect(reveal.ghosts()).toEqual({});
 });
});

it("renders random fake tab chords with aligned lengths on distinct playable strings",()=>{
 for(const instrumentType of ["guitar-tab","bass-tab"] as const){
  const lane={...source().editors[0],instrumentType}, original=structuredClone(lane);
  const ghosts=ghostNotes(lane,new Set(),0,5).filter(note=>note.phase==="fake");
  const groups=new Map<number,typeof ghosts>();for(const note of ghosts)groups.set(note.start,[...(groups.get(note.start) ?? []),note]);
  const chords=[...groups.values()].filter(group=>group.length>1);
  expect(chords.length).toBeGreaterThan(0);
  if(instrumentType === "guitar-tab")expect(chords.some(group=>group.length>=3)).toBe(true);
  for(const chord of chords){expect(new Set(chord.map(note=>note.length)).size).toBe(1);expect(new Set(chord.map(note=>note.tab[0])).size).toBe(chord.length);expect(chord.every(note=>note.tab[0]>=0 && note.tab[0]<(instrumentType === "bass-tab" ? 4 : 6))).toBe(true);}
  expect(lane).toEqual(original);expect(lane.chords).toEqual([]);
 }
});
