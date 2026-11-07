import { describe,it,expect } from "vitest";
import { createStreamingReveal } from "../../lib/gteStreamingReveal";
import { ghostNotes, cleanStreamingGhosts, placeholderGhosts, streamingGhostColor, streamingGhostFret, type StreamingGhost } from "../../lib/gteStreamingGhosts";
import { completeStreamingCanvas } from "../../lib/gteStreamingCompletion";
import { getStreamingHead, setStreamingHead, subscribeStreamingHead } from "../../lib/gteStreamingHead";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";
const source=():CanvasSnapshot=>({id:"ghost-test",secondsPerBar:2,editors:[{id:"guitar",instrumentType:"guitar-tab",fps:240,totalFrames:1920,framesPerMessure:480,timeSignature:4,notes:[0,120,240,480].map((startTime,index)=>({id:-index-1,startTime,length:60,midiNum:60+index,tab:[index,5+index],optimals:[]})),chords:[],cutPositionsWithCoords:[],optimalsByTime:{}}]});
const draft=(key:string,start:number,string=0):StreamingGhost=>({key,phase:"preview",showLabel:false,start,length:30,midi:60+string,tab:[string,0]});
describe("display-only streaming ghosts",()=>{
 it("shows a real translucent preview before putting a note in the musical score",()=>{
  const raw=source(), untouched=structuredClone(raw), reveal=createStreamingReveal({previewMs:300});
  reveal.receive(raw,false,8);
  const pending=reveal.advance(125)!;
  expect(pending.editors[0].notes).toHaveLength(0);
  const previews=reveal.ghosts().guitar.filter(note=>note.phase==="preview");
  expect(previews).toHaveLength(1); expect(previews[0]).toMatchObject({start:0,midi:60,tab:[0,5]});
  expect(reveal.advance(100)!.editors[0].notes).toHaveLength(0);
  const solid=reveal.advance(200)!;
  expect(solid.editors[0].notes.map(note=>note.id)).toEqual([-1]);
  expect(reveal.ghosts().guitar.some(note=>note.key==="n:-1")).toBe(false);
  expect(JSON.stringify(completeStreamingCanvas(pending,{tracks:[]}))).not.toContain('"phase"');
  expect(raw).toEqual(untouched);
 });
 it("with no real music yet, only faint placeholders ahead of the sweeping head are drawn, never score notes",()=>{
  const raw=source(); raw.editors[0].notes=[];
  const reveal=createStreamingReveal(); const initial=reveal.receive(raw,false,5)!;
  for(let i=0;i<20;i++)reveal.advance(125);
  const ghosts=reveal.ghosts().guitar, head=reveal.headSeconds()!;
  expect(head).toBeGreaterThan(0); expect(ghosts.length).toBeGreaterThan(0);
  expect(ghosts.every(note=>note.phase==="placeholder" && note.showLabel===false)).toBe(true);
  expect(ghosts.every(note=>note.start/raw.editors[0].fps>head)).toBe(true);
  expect(reveal.advance(125)!.editors[0].notes).toEqual([]); expect(initial.editors[0].notes).toEqual([]);
 });
 it("sweeps a simulated head over the empty editor before any canvas exists, then hands off cleanly",()=>{
  const lane={...source().editors[0],id:"awaiting",notes:[]}, reveal=createStreamingReveal();
  expect(reveal.headSeconds()).toBeNull(); expect(reveal.ghosts([lane])).toEqual({});
  reveal.advance(0); expect(reveal.headSeconds()).toBeNull();
  reveal.advance(1000); reveal.advance(1000);
  expect(reveal.headSeconds()).toBeGreaterThan(1.5);
  const idle=reveal.ghosts([lane]).awaiting;
  expect(idle.length).toBeGreaterThan(0); expect(idle.every(note=>note.phase==="placeholder")).toBe(true);
  reveal.receive(source(),false,8); // real canvas replaces the simulation, head restarts at the beginning
  expect(reveal.headSeconds()).toBe(0);
  expect(Object.keys(reveal.ghosts([lane]))).not.toContain("awaiting");
  reveal.reset(); expect(reveal.headSeconds()).toBeNull();
 });
 it("shows unsettled draft notes only as the write head passes them, in order",()=>{
  const raw=source(); raw.editors[0].notes=[];
  const reveal=createStreamingReveal(); reveal.receive(raw,false,0,{guitar:[draft("a",0),draft("b",120,1),draft("c",480,2)]});
  expect(reveal.headSeconds()).toBe(0);
  const seen:number[]=[];
  for(let i=0;i<200;i++){reveal.advance(125);seen.push(reveal.ghosts().guitar.filter(note=>note.phase==="preview").length);}
  expect([...seen].sort((a,b)=>a-b)).toEqual(seen); expect(seen[0]).toBeLessThan(3); expect(seen.at(-1)).toBe(3);
 });
 it("replaces a draft in place once its bar settles, without a gap",()=>{
  const raw=source(), first=structuredClone(raw); first.editors[0].notes=[];
  const reveal=createStreamingReveal({previewMs:300}); reveal.receive(first,false,0,{guitar:[draft("unsettled:0",0)]});
  for(let i=0;i<8;i++)reveal.advance(125);
  expect(reveal.ghosts().guitar.filter(note=>note.phase==="preview").map(note=>note.key)).toEqual(["unsettled:0"]);
  reveal.receive(raw,false,8,{});
  // The head has already passed the settled notes, so they preview immediately.
  expect(reveal.ghosts().guitar.some(note=>note.phase==="preview" && note.key.startsWith("n:"))).toBe(true);
 });
 it("holds completion for the real preview and clears ghosts and the head after the last solid note",()=>{
  const raw=source(),reveal=createStreamingReveal({previewMs:300}); reveal.receive(raw,true,8);
  let final=reveal.advance(125)!;
  for(let i=0;i<40 && reveal.pending();i++)final=reveal.advance(125)!;
  expect(reveal.pending()).toBe(0); expect(reveal.ghosts()).toEqual({}); expect(reveal.headSeconds()).toBeNull(); expect(final).toEqual(raw);
  reveal.reset(); expect(reveal.ghosts()).toEqual({});
 });
 it("publishes the head to subscribers without touching React state",()=>{
  let calls=0;const off=subscribeStreamingHead(()=>{calls++;});
  setStreamingHead(1.5);setStreamingHead(1.5);setStreamingHead(null);off();
  expect(calls).toBe(2);expect(getStreamingHead()).toBeNull();
 });
});

it("derives preview ghosts only from real notes and never exposes invented fret labels",()=>{
 const lane=source().editors[0];
 expect(ghostNotes(lane,new Set())).toEqual([]);
 const ghosts=ghostNotes(lane,new Set(["guitar:n:-1"]));
 expect(ghosts).toHaveLength(1);
 expect(streamingGhostColor({...ghosts[0],shape:"chord"})).toBe("#30bced");
 expect(streamingGhostFret({...draft("x",0),tab:[0,8]})).toBe("");
 expect(streamingGhostFret({...ghosts[0],tab:[0,8]})).toBe("8");
});
it("hides ghosts that would sit on real notes or earlier ghosts",()=>{
 const lane=source().editors[0];lane.notes=[{...lane.notes[0],startTime:90,length:80,tab:[1,7]}];
 const ghosts=[draft("on-note",100,1),draft("free",100,0),draft("on-free",110,0),draft("later",300,0)];
 expect(cleanStreamingGhosts(lane,ghosts).map(note=>note.key)).toEqual(["free","later"]);
 expect(lane.notes[0].tab[1]).toBe(7);
});

describe("cosmetic placeholders",()=>{
 const lane=():EditorSnapshot=>({...source().editors[0],notes:[]});
 it("are deterministic, stay strictly ahead of the head, and move with it",()=>{
  const one=placeholderGhosts(lane(),1,3), again=placeholderGhosts(lane(),1,3);
  expect(one).toEqual(again); expect(one.length).toBeGreaterThan(4);
  expect(one.every(note=>note.start/240>1 && note.start/240<=4)).toBe(true);
  const later=placeholderGhosts(lane(),2,3);
  expect(later.some(note=>note.start/240<=2)).toBe(false);
  const shared=one.filter(note=>later.some(other=>other.key===note.key));
  expect(shared.length).toBeGreaterThan(0); // overlapping stretch keeps the very same notes, so nothing flickers
 });
 it("draw tab chords on distinct strings with equal lengths and no invented fret labels",()=>{
  for(const instrumentType of ["guitar-tab","bass-tab"] as const){
   const items=placeholderGhosts({...lane(),instrumentType},0,40), groups=new Map<number,typeof items>();
   for(const note of items)groups.set(note.start,[...(groups.get(note.start) ?? []),note]);
   const chords=[...groups.values()].filter(group=>group.length>1);
   expect(chords.length).toBeGreaterThan(0);
   for(const chord of chords){expect(new Set(chord.map(note=>note.tab[0])).size).toBe(chord.length);expect(new Set(chord.map(note=>note.length)).size).toBe(1);}
   expect(items.every(note=>streamingGhostFret(note)==="")).toBe(true);
   expect(items.every(note=>note.tab[0]>=0 && note.tab[0]<(instrumentType==="bass-tab" ? 4 : 6))).toBe(true);
  }
 });
 it("never extend past the end of the track",()=>{
  const short={...lane(),totalFrames:480};
  expect(placeholderGhosts(short,0,100).every(note=>note.start<480)).toBe(true);
 });
 it("are hidden wherever real music or a real preview already is, as whole groups",()=>{
  const l=lane(); l.notes=[{...source().editors[0].notes[0],startTime:100,length:80,tab:[1,7]}];
  const group=(key:string,start:number,strings:number[]):StreamingGhost[]=>strings.map(string=>({key:`${key}:${string}`,phase:"placeholder" as const,shape:"chord" as const,start,length:20,midi:60,tab:[string,0] as [number,number]}));
  const real:StreamingGhost={...draft("real",300,0),length:60};
  const shown=cleanStreamingGhosts(l,[...group("hit",105,[0,1,2]),...group("free",200,[3,4]),...group("near-real",310,[0,1]),real]);
  expect(shown.map(note=>note.key)).toEqual(["real","free:3","free:4"]);
 });
});
