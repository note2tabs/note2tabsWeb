import { describe,it,expect } from "vitest";
import { createStreamingReveal } from "../../lib/gteStreamingReveal";
import { ghostNotes, cleanStreamingGhosts, streamingGhostColor, streamingGhostFret, type StreamingGhost } from "../../lib/gteStreamingGhosts";
import { completeStreamingCanvas } from "../../lib/gteStreamingCompletion";
import { getStreamingHead, setStreamingHead, subscribeStreamingHead } from "../../lib/gteStreamingHead";
import type { CanvasSnapshot } from "../../types/gte";
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
 it("never invents notes: with no real music or drafts there is nothing to draw",()=>{
  const raw=source(); raw.editors[0].notes=[];
  const reveal=createStreamingReveal(); reveal.receive(raw,false,5);
  for(let i=0;i<20;i++)reveal.advance(125);
  expect(reveal.ghosts().guitar).toEqual([]); expect(reveal.headSeconds()).toBeNull();
 });
 it("shows unsettled draft notes only as the write head passes them, in order",()=>{
  const raw=source(); raw.editors[0].notes=[];
  const reveal=createStreamingReveal(); reveal.receive(raw,false,0,{guitar:[draft("a",0),draft("b",120,1),draft("c",480,2)]});
  expect(reveal.headSeconds()).toBe(0);
  const seen:number[]=[];
  for(let i=0;i<200;i++){reveal.advance(125);seen.push(reveal.ghosts().guitar.length);}
  expect([...seen].sort((a,b)=>a-b)).toEqual(seen); expect(seen[0]).toBeLessThan(3); expect(seen.at(-1)).toBe(3);
 });
 it("replaces a draft in place once its bar settles, without a gap",()=>{
  const raw=source(), first=structuredClone(raw); first.editors[0].notes=[];
  const reveal=createStreamingReveal({previewMs:300}); reveal.receive(first,false,0,{guitar:[draft("unsettled:0",0)]});
  for(let i=0;i<8;i++)reveal.advance(125);
  expect(reveal.ghosts().guitar.map(note=>note.key)).toEqual(["unsettled:0"]);
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
