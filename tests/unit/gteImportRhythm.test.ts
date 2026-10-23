import { describe, expect, it, vi } from "vitest";
import { estimateImportRhythmScale, scaleImportTimingMap, scaleImportedLane } from "../../lib/gteImportRhythm";
import { frameToSeconds, synthesizeTimingMap } from "../../lib/gteTiming";
import { gteApi, optimizeImportedTrackFingerings } from "../../lib/gteApi";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";

const lane = (length = 60): EditorSnapshot => ({ id:"piano", instrumentType:"notation", instrumentId:"upright_piano", framesPerMessure:480, totalFrames:1920, fps:240, timeSignature:4, timeSignatureBottom:4,
  notes: Array.from({length:8},(_,index)=>({id:index+1,midiNum:60+index,startTime:index*180,length,velocity:100/127,tab:[0,0],optimals:[]})), chords:[], cutPositionsWithCoords:[[[0,1920],[2,0]]], optimalsByTime:{} });
const canvas = (track: EditorSnapshot): CanvasSnapshot => ({ id:"project",version:1,secondsPerBar:2,timingMap:synthesizeTimingMap(2,1920,4,4),editors:[track] });

describe("eighth-note-preferred transcription tempo", () => {
  it.each([[480,.125],[240,.25],[120,.5],[60,1],[30,2],[15,4],[7.5,8]])("maps dominant %s-frame notes to eighths at tempo scale %s without changing seconds",(length,scale)=>{
    const source=canvas(lane(length)), before=structuredClone(source), map=source.timingMap!;
    expect(estimateImportRhythmScale(source)).toBe(scale);
    const nextMap=scaleImportTimingMap(map,scale), next=scaleImportedLane(source.editors[0],scale,2/scale);
    expect(nextMap.bars[0].quarterNoteBpm).toBeCloseTo(120*scale);
    for(let i=0;i<next.notes.length;i++) {
      expect(next.notes[i].length).toBe(60);
      for(const edge of [0,1]) expect(frameToSeconds(nextMap,next.notes[i].startTime+edge*next.notes[i].length)).toBeCloseTo(frameToSeconds(map,source.editors[0].notes[i].startTime+edge*length),9);
    }
    expect(source).toEqual(before);
  });
  it("counts simultaneous chord tones once and uses onset spacing for drum-only imports",()=>{
    const source=canvas(lane());
    source.editors[0].notes.push(...Array.from({length:20},(_,index)=>({...source.editors[0].notes[0],id:100+index,startTime:1500,length:120,midiNum:40+index})));
    expect(estimateImportRhythmScale(source)).toBe(1);
    source.editors=[{...lane(1),instrumentType:"drums",trackType:"drums",notes:lane(1).notes.map((note,index)=>({...note,startTime:index*30}))}];
    expect(estimateImportRhythmScale(source)).toBe(2);
  });
  it("preserves variable-tempo anchors and audio offsets when splitting or combining bars",()=>{
    const map=synthesizeTimingMap(2,1920); map.audioOffsetSeconds=.27;
    map.bars[0].anchors=[{tick:120,seconds:.4},{tick:300,seconds:1.35}];
    for(const scale of [.125,.5,2,8]) for(const frame of [0,1.5,120,250.4,479.5,480,900,1919]) expect(frameToSeconds(scaleImportTimingMap(map,scale),frame*scale)).toBeCloseTo(frameToSeconds(map,frame),9);
    map.bars[0].source="manual"; expect(scaleImportTimingMap(map,2)).toBe(map);
  });
  it.each([2, .5])("explicit tempo scaling preserves seconds with manually edited bars (%s)",factor=>{
    const map=synthesizeTimingMap(2,1920);
    map.bars[0].source="manual";
    map.bars[0].anchors=[{tick:120,seconds:.4},{tick:300,seconds:1.35}];
    const scaled=scaleImportTimingMap(map,factor,true);
    expect(scaled).not.toBe(map);
    for(const frame of [0,120,250,480,900,1919])
      expect(frameToSeconds(scaled,frame*factor)).toBeCloseTo(frameToSeconds(map,frame),9);
  });
  it("uses the meter's whole-note duration rather than assuming 4/4",()=>{
    const source=canvas({...lane(40),timeSignature:3}); source.timingMap=synthesizeTimingMap(1.5,1920,3,4);
    expect(estimateImportRhythmScale(source)).toBe(2);
  });
  it("rescales chord strums, offsets, coordinate regions, rests and drum loops with their notes",()=>{
    const source=lane(120); source.timelineOffsetFrames=480;
    source.chords=[{id:20,startTime:600,length:120,originalMidi:[60,64],currentTabs:[[0,0],[1,0]],ogTabs:[],velocities:[.4,.7],strums:[{time:615,direction:"down"}]}];
    source.drumLoops=[{id:"loop",sourceStart:480,sourceEnd:960,loopEnd:1920}];
    source.notation={rests:[{id:1,start:480,length:120,staff:"treble",voice:1,denominator:4,dotted:false}]};
    const next=scaleImportedLane(source,.5,4);
    expect(next.timelineOffsetFrames).toBe(240); expect(next.totalFrames).toBe(960);
    expect(next.chords[0]).toMatchObject({startTime:300,length:60,velocities:[.4,.7],strums:[{time:307.5,direction:"down"}]});
    expect(next.cutPositionsWithCoords[0][0]).toEqual([0,960]);
    expect(next.drumLoops![0]).toMatchObject({sourceStart:240,sourceEnd:480,loopEnd:960});
    expect(next.notation!.rests![0]).toMatchObject({start:240,length:60});
  });
  it("persists scaled original piano events together with the preferred map", async()=>{
    const source=canvas(lane(30)), preferred=scaleImportTimingMap(source.timingMap!,2), fetch=vi.fn(async()=>new Response(JSON.stringify({ok:true}),{status:200}));
    vi.stubGlobal("fetch",fetch);
    try {
      const result=await optimizeImportedTrackFingerings("project",source,2,["piano"],[{name:"Piano",trackType:"tab",program:0,instrumentId:"upright_piano",segments:[{start_time_s:.125,end_time_s:.25,pitch_midi:21,amplitude:.6}]}],{timingMap:source.timingMap,rhythmScale:2,preferredTimingMap:preferred});
      expect(result.editors[0].notes[0]).toMatchObject({midiNum:21,startTime:60,length:60,velocity:.6});
      expect(frameToSeconds(result.timingMap!,60)).toBe(.125);
      const wire=JSON.parse(String((fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body)).snapshot;
      expect(wire.timingMap.bars[0].quarterNoteBpm).toBe(240);
      expect(wire.editors[0].chordEditor.notation.assignments["n:1"].start).toBe(60);
    }finally{vi.unstubAllGlobals();}
  });
  it.each(["saved","guest"])("wires the eighth-note preference through the %s import flow",async(target)=>{
    const source=canvas(lane(30)), tracks=[{name:"Piano",trackType:"tab" as const,program:0,instrumentId:"upright_piano",segments:source.editors[0].notes.map(note=>({start_time_s:note.startTime/240,end_time_s:(note.startTime+note.length)/240,pitch_midi:note.midiNum}))}];
    const requests:Array<{url:string;body:any}>=[];
    vi.stubGlobal("fetch",vi.fn(async(url,init)=>{
      const body=init?.body ? JSON.parse(String(init.body)) : {}; requests.push({url:String(url),body});
      const payload=init?.method==="PATCH" ? {ok:true,canvas:{...source,timingMap:body.timingMap,version:2},timingMap:body.timingMap} : String(url).endsWith("/transcriber/import") ? {ok:true,editorId:"project",importedEditorIds:["piano"],canvas:source} : {ok:true};
      return new Response(JSON.stringify(payload),{status:200});
    }));
    try {
      const payload={segmentGroups:tracks.map(track=>track.segments),tracks};
      const result=target==="saved" ? await gteApi.importTranscriberToSaved({...payload,target:"new"}) : await gteApi.importTranscriberToGuest(payload);
      expect(result.canvas!.timingMap!.bars[0].quarterNoteBpm).toBe(240);
      expect(result.canvas!.editors[0].notes.every(note=>note.length===60)).toBe(true);
      result.canvas!.editors[0].notes.forEach((note,index)=>{
        expect(frameToSeconds(result.canvas!.timingMap!,note.startTime)).toBeCloseTo(tracks[0].segments[index].start_time_s,8);
        expect(frameToSeconds(result.canvas!.timingMap!,note.startTime+note.length)).toBeCloseTo(tracks[0].segments[index].end_time_s,8);
      });
      expect(requests.find(request=>request.url.endsWith("/snapshot"))!.body.snapshot.timingMap.bars[0].quarterNoteBpm).toBe(240);
    }finally{vi.unstubAllGlobals();}
  });
});
