import { describe, expect, it } from "vitest";
import { buildPracticeTabLayout, practiceTabPosition } from "../../lib/gtePracticeTabLayout";
import type { EditorSnapshot } from "../../types/gte";
const track = (): EditorSnapshot => ({id:"practice",instrumentId:"acoustic",framesPerMessure:480,totalFrames:1920,fps:240,notes:[],chords:[],cutPositionsWithCoords:[],optimalsByTime:{}});
const dense = () => {
  const source = track();
  source.notes = Array.from({length:64},(_,i) => ({id:i+1,startTime:i*15,length:15,midiNum:64,tab:[0,i%2 ? 14 : 12] as [number,number],optimals:[]}));
  source.chords = Array.from({length:8},(_,i) => ({id:i+1,startTime:960+i*60,length:60,originalMidi:[45,52,57,61,64],currentTabs:[[0,4],[1,5],[2,6],[3,6],[4,4]] as [number,number][],ogTabs:[]}));
  return source;
};
describe("read-only Practice tablature layout", () => {
  it("gives repeated rhythms matching distances regardless of fret digit count", () => {
    const source = track(); source.totalFrames = 960;
    source.notes = [2,4,2,4,12,14,12,14].map((fret,i) => ({id:i+1,startTime:Math.floor(i/4)*480+(i%4)*60,length:60,midiNum:64,tab:[0,fret] as [number,number],optimals:[]}));
    const layout = buildPracticeTabLayout(source,900), measures = layout.measures;
    const distances = (i:number) => measures[i].frets.slice(1).map((note,j) => note.x-measures[i].frets[j].x);
    distances(0).forEach((distance,i) => expect(distance).toBeCloseTo(distances(1)[i],6));
  });
  it("uses more width for longer rhythmic gaps without stretching sparse measures", () => {
    const source = track(); source.totalFrames = 960;
    source.notes = [0,60,180,480].map((startTime,i) => ({id:i+1,startTime,length:60,midiNum:64,tab:[0,12] as [number,number],optimals:[]}));
    const layout = buildPracticeTabLayout(source,1200), notes = layout.measures[0].frets;
    expect(notes[2].x-notes[1].x).toBeGreaterThan(notes[1].x-notes[0].x);
    expect(layout.measures[1].width).toBeLessThan(90);
    expect(layout.measures[1].width).toBeLessThan(layout.measures[0].width);
  });
  it("reduces inter-system whitespace by about 25% and trims the last margin", () => {
    const layout = buildPracticeTabLayout(dense(),320);
    const gap = layout.rowHeight-(layout.labels.length-1)*layout.stringGap;
    expect(gap/63).toBeGreaterThanOrEqual(0.7);
    expect(gap/63).toBeLessThanOrEqual(0.8);
    expect(layout.height).toBeLessThan(layout.rowCount*layout.rowHeight);
    const overlay = buildPracticeTabLayout(dense(),320,undefined,true);
    expect(overlay.rowHeight-layout.rowHeight).toBeGreaterThanOrEqual(16);
  });
  it("collapses empty ranges without hiding holds and keeps focused ranges", () => {
    const source = track(); source.totalFrames = 480*8;
    source.notes = [{id:1,startTime:480*5,length:960,midiNum:64,tab:[0,12],optimals:[]}];
    const layout = buildPracticeTabLayout(source,900);
    expect(layout.measures[0]).toMatchObject({bar:0,endBar:5});
    expect(layout.measures.some(measure => measure.bar === 6)).toBe(true);
    const focused = buildPracticeTabLayout(source,900,{startBar:5,endBar:6});
    expect(focused.measures.map(measure => measure.bar)).toEqual([5,6]);
    expect(focused.frets).toHaveLength(1);
  });
  it.each([320,375,768,1200])("keeps dense two-digit fret labels separated at width %i", width => {
    const source = dense(), before = structuredClone(source), layout = buildPracticeTabLayout(source,width);
    expect(layout.frets).toHaveLength(104);
    for (const measure of layout.measures) {
      expect(measure.x).toBeGreaterThanOrEqual(0);
      expect(measure.x+measure.width).toBeLessThanOrEqual(width+0.01);
      const groups = new Map<number,typeof layout.frets>();
      measure.frets.forEach(note => { const group = groups.get(note.start) ?? []; group.push(note); groups.set(note.start,group); });
      const ordered = [...groups.values()];
      for (let i = 1; i < ordered.length; i++) {
        const previous = ordered[i-1], next = ordered[i];
        expect(Math.min(...next.map(note => note.x-note.width/2))-Math.max(...previous.map(note => note.x+note.width/2))).toBeGreaterThanOrEqual(5.99);
      }
      for (const group of ordered) expect(new Set(group.map(note => note.x)).size).toBe(1);
    }
    expect(source).toEqual(before);
    expect(new Set(layout.frets.map(note => note.key)).size).toBe(104);
  });
  it("uses density-dependent widths and continuation systems instead of tiny frets", () => {
    const layout = buildPracticeTabLayout(dense(),375);
    expect(layout.measures.some(measure => measure.continuation)).toBe(true);
    expect(new Set(layout.measures.map(measure => Math.round(measure.width))).size).toBeGreaterThan(1);
    const desktop = buildPracticeTabLayout(track(),1200);
    expect(desktop.measures.every(measure => measure.row === 0)).toBe(true);
  });
  it("packs multiple Africa-like measures on desktop systems without excessive stretching", () => {
    const source = track(); source.totalFrames = 480*8;
    source.notes = [8,16,10,8,10,12,8,8].flatMap((count,bar) => Array.from({length:count},(_,i) => ({id:bar*100+i,startTime:bar*480+i*480/count,length:480/count,midiNum:64,tab:[0,i%3 ? 2 : 14] as [number,number],optimals:[]})));
    const layout = buildPracticeTabLayout(source,960);
    expect(layout.rowCount).toBeLessThanOrEqual(3);
    expect(layout.measures.filter(measure => measure.row === 0).length).toBeGreaterThanOrEqual(2);
    expect(layout.rowHeight).toBeLessThan(150);
  });
  it("maps each real onset exactly and interpolates through non-linear spacing", () => {
    const source = track(); source.totalFrames = 480;
    source.notes = [0,15,240].map((startTime,i) => ({id:i+1,startTime,length:30,midiNum:64,tab:[0,12] as [number,number],optimals:[]}));
    const layout = buildPracticeTabLayout(source,800), notes = layout.frets;
    notes.forEach(note => {const p = practiceTabPosition(layout,note.start); expect(p.x).toBeCloseTo(note.x); expect(p.row).toBe(note.row);});
    expect(practiceTabPosition(layout,127.5).x).toBeCloseTo((notes[1].x+notes[2].x)/2);
    expect((notes[1].x-notes[0].x)/15).not.toBeCloseTo((notes[2].x-notes[1].x)/225);
  });
  it("keeps cross-bar holds at their original onset and duration, and supports seek/loop positions", () => {
    const source = track(); source.notes = [{id:1,startTime:450.25,length:900,midiNum:40,tab:[5,0],optimals:[]}];
    const layout = buildPracticeTabLayout(source,320);
    expect(layout.frets[0]).toMatchObject({start:450.25,end:1350.25,string:5,label:"0"});
    for (const time of [1600,0,900,450.25]) expect(practiceTabPosition(layout,time).measure.bar).toBe(Math.floor(time/480));
  });
});
