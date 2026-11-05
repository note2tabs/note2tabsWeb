import {describe,it,expect} from "vitest";
import {recomputeSnapshotOptimals} from "../../components/GteWorkspace";
import type {EditorSnapshot} from "../../types/gte";
import type {FingeringDerivationCache} from "../../lib/gteFingeringDerivationCache";
const initial=():EditorSnapshot=>({id:"lane",fps:240,framesPerMessure:480,totalFrames:960,notes:[{id:1,startTime:0,length:60,midiNum:64,tab:[0,0],optimals:[]},{id:2,startTime:240,length:60,midiNum:62,tab:[1,3],optimals:[]}],chords:[],cutPositionsWithCoords:[[[0,960],[2,0]]],optimalsByTime:{}});
describe("incremental alternate fingerings",()=>{
 it("matches full recomputation through musical changes, undo and deletion",()=>{
  const cache:FingeringDerivationCache=new Map();const base=initial();
  const edits:EditorSnapshot[]=[base,{...base,notes:base.notes.map(note=>({...note,voice:2 as const}))},{...base,notes:base.notes.map((note,i)=>i?note:{...note,midiNum:65})},{...base,notes:base.notes.map((note,i)=>i?{...note,startTime:10}:note)},{...base,cutPositionsWithCoords:[[[0,960],[3,7]]]},{...base,tuning:{openStringMidi:[40,45,50,55,59,64]}},{...base,maxFret:12},{...base,chords:[{id:8,startTime:0,length:300,currentTabs:[[1,2],[3,2]],ogTabs:[],originalMidi:[61,52]}]},{...base,noteEffects:[{type:0,startNoteId:1,endNoteId:2} as any]},base,{...base,notes:[base.notes[1]]}];
  for(const snapshot of edits)expect(recomputeSnapshotOptimals(snapshot,cache)).toEqual(recomputeSnapshotOptimals(snapshot));
  expect([...cache.keys()]).toEqual([2]);
 });
 it("reuses unaffected derivations and protects cached coordinates from mutation",()=>{
  const cache:FingeringDerivationCache=new Map(),base=initial();recomputeSnapshotOptimals(base,cache);const before=new Map(cache);
  const voiceEdit={...base,notes:base.notes.map(note=>({...note,voice:2 as const}))};const result=recomputeSnapshotOptimals(voiceEdit,cache);
  for(const [id,entry] of before)expect(cache.get(id)).toBe(entry);
  result.notes[0].optimals[0][0]=999;
  expect(recomputeSnapshotOptimals(base,cache)).toEqual(recomputeSnapshotOptimals(base));
  recomputeSnapshotOptimals({...base,notes:base.notes.map((note,i)=>i?note:{...note,midiNum:65})},cache);
  expect(cache.get(1)).not.toBe(before.get(1));expect(cache.get(2)).toBe(before.get(2));
 });

 it("matches the reference across a deterministic sequence of overlapping edits",()=>{
  const cache:FingeringDerivationCache=new Map();let snapshot=initial();
  snapshot.notes=Array.from({length:40},(_,i)=>({...snapshot.notes[i%2],id:i+1,startTime:i*10,length:60}));
  let seed=7321;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let step=0;step<100;step++){
    const index=random()%snapshot.notes.length;
    snapshot={...snapshot,notes:snapshot.notes.map((note,i)=>i===index?{...note,startTime:random()%600,length:1+random()%300,midiNum:random()%5?45+random()%35:0,tab:[random()%6,random()%20]}:note)};
    if(step%10===0)snapshot={...snapshot,tuning:{openStringMidi:[64,59,55,50,45,40],capo:step%4}};
    expect(recomputeSnapshotOptimals(snapshot,cache)).toEqual(recomputeSnapshotOptimals(snapshot));
  }
 });
 it.skipIf(process.env.N2T_BENCHMARK!=="1")("reports repeatable derivation timings on a 5,000-note lane",()=>{
  const base=initial();base.totalFrames=150060;
  base.notes=Array.from({length:5000},(_,i)=>({...base.notes[i%2],id:i+1,startTime:i*30}));
  const cache:FingeringDerivationCache=new Map();recomputeSnapshotOptimals(base,cache);
  const edit={...base,notes:base.notes.map(note=>({...note,voice:2 as const}))};
  const median=(values:number[])=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const full:number[]=[],cached:number[]=[];
  for(let run=0;run<7;run++){
    let start=performance.now();recomputeSnapshotOptimals(edit);full.push(performance.now()-start);
    start=performance.now();recomputeSnapshotOptimals(edit,cache);cached.push(performance.now()-start);
  }
  expect(recomputeSnapshotOptimals(edit,cache)).toEqual(recomputeSnapshotOptimals(edit));
  process.stdout.write(JSON.stringify({notes:5000,fullMedianMs:median(full),cachedMedianMs:median(cached)})+"\n");
 });

});
