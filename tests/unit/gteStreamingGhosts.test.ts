import { describe,it,expect } from "vitest";
import { createStreamingReveal } from "../../lib/gteStreamingReveal";
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
 it("keeps placeholders within one bar and stops them at the available watermark",()=>{
  const raw=source(),reveal=createStreamingReveal({previewMs:300}); reveal.receive(raw,false,8);
  reveal.advance();
  for(let i=0;i<8;i++) {
   reveal.advance(125);
   for(const ghost of reveal.ghosts().guitar.filter(note=>note.phase==="fake")) {
    expect(ghost.start/raw.editors[0].fps).toBeLessThanOrEqual(reveal.throughSeconds()+2);
    expect(ghost.start/raw.editors[0].fps).toBeLessThanOrEqual(8);
   }
  }
 });
 it("holds completion for the real preview and clears all ghosts after the last solid note",()=>{
  const raw=source(),reveal=createStreamingReveal({previewMs:300}); reveal.receive(raw,true,8);
  reveal.advance(1500); expect(reveal.pending()).toBe(4);
  const final=reveal.advance(300)!;
  expect(reveal.pending()).toBe(0); expect(reveal.ghosts()).toEqual({}); expect(final).toEqual(raw);
  reveal.reset(); expect(reveal.ghosts()).toEqual({});
 });
});
