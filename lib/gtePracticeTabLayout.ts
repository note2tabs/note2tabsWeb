import type { EditorSnapshot } from "../types/gte";
import { getStringLabelsForSnapshot } from "./gteTuning";

export type PracticeFret = { key: string; start: number; end: number; string: number; label: string; width: number; x: number; y: number; row: number };
type Anchor = { time: number; x: number };
export type PracticeMeasure = { bar: number; endBar: number; start: number; end: number; continuation: boolean; x: number; width: number; row: number; anchors: Anchor[]; frets: PracticeFret[] };
export type PracticeTabLayout = { width: number; height: number; rowHeight: number; stringTop: number; stringGap: number; labels: string[]; measures: PracticeMeasure[]; frets: PracticeFret[]; rowCount: number };
const LABEL_FONT = 16;
const MARGIN = 8, GUTTER = 24, PAD = 12, GAP = 6;
// Tabular numerals have a fixed advance. Conservative boxes include mask padding.
const labelWidth = (text: string) => text.length * LABEL_FONT * 0.62 + 4;

/** Read-only layout: never quantizes or changes source notes/tabs/timing. */
export function buildPracticeTabLayout(snapshot: EditorSnapshot, availableWidth: number, focus?: { startBar: number; endBar: number } | null, hasChordOverlays = false): PracticeTabLayout {
  const width = Math.max(180, Math.floor(availableWidth)), labels = getStringLabelsForSnapshot(snapshot);
  const stringGap = 16, stringTop = 25, bottomGap = hasChordOverlays ? 36 : 20;
  const rowHeight = stringTop + (labels.length-1)*stringGap + bottomGap;
  const barFrames = Math.max(1,snapshot.framesPerMessure || 480);
  const frets: PracticeFret[] = [];
  const add = (key: string, start: number, length: number, tab: number[]) => {
    if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0 || !Number.isInteger(tab?.[0]) || tab[0] < 0 || tab[0] >= labels.length || !Number.isFinite(tab[1])) return;
    const label = String(tab[1]);
    frets.push({key,start:Math.max(0,start),end:Math.max(0,start)+length,string:tab[0],label,width:labelWidth(label),x:0,y:0,row:0});
  };
  snapshot.notes.forEach(note => add(`n:${note.id}`,note.startTime,note.length,note.tab));
  snapshot.chords.forEach(chord => chord.currentTabs.forEach((tab,i) => add(`c:${chord.id}:${i}`,chord.startTime,chord.length,tab)));
  frets.sort((a,b) => a.start-b.start || a.string-b.string || a.key.localeCompare(b.key));
  // One spacing vocabulary for the entire track: the same rhythm should not
  // change width just because a passage switches between fret 2 and fret 12.
  const columnWidth = Math.max(labelWidth("0"),...frets.map(note => note.width));
  const rhythmicWeight = (duration: number) => Math.sqrt(Math.max(1/64,duration/barFrames));
  const rhythmicAdvance = (duration: number) => Math.max(columnWidth+GAP, Math.min(80,(columnWidth+GAP)*Math.sqrt(Math.max(0,duration)/(barFrames/8))));
  const barCount = Math.max(1,Math.ceil(Math.max(snapshot.totalFrames || 0,...frets.map(note => note.end))/barFrames));
  const byBar = new Map<number,PracticeFret[]>();
  frets.forEach(note => { const bar = Math.floor(note.start/barFrames), list = byBar.get(bar) ?? []; list.push(note); byBar.set(bar,list); });
  const usable = width-MARGIN*2-GUTTER;
  const occupied = new Set<number>();
  frets.forEach(note => { for (let bar = Math.floor(note.start/barFrames); bar < Math.ceil(note.end/barFrames); bar++) occupied.add(bar); });
  const firstBar = Math.min(barCount-1,Math.max(0,focus?.startBar ?? 0)), lastBar = Math.max(firstBar,Math.min(barCount-1,focus?.endBar ?? barCount-1));
  const measures: PracticeMeasure[] = [];
  for (let bar = firstBar; bar <= lastBar; bar++) {
    if (!occupied.has(bar)) {
      let endBar = bar+1;
      while (endBar <= lastBar && !occupied.has(endBar)) endBar++;
      const natural = Math.min(endBar > bar+1 ? 100 : 64,usable);
      measures.push({bar,endBar,start:bar*barFrames,end:endBar*barFrames,continuation:false,x:0,width:natural,row:0,anchors:[{time:bar*barFrames,x:0},{time:endBar*barFrames,x:natural}],frets:[]});
      bar = endBar-1; continue;
    }
    const notes = byBar.get(bar) ?? [], groups: PracticeFret[][] = [];
    notes.forEach(note => { if (groups.at(-1)?.[0].start === note.start) groups.at(-1)!.push(note); else groups.push([note]); });
    let offset = 0;
    do {
      const selected: PracticeFret[][] = [], centers: number[] = [];
      let required = PAD*2;
      while (offset+selected.length < groups.length) {
        const group = groups[offset+selected.length], half = Math.max(...group.map(note => note.width))/2;
        const previous = selected.at(-1), previousHalf = previous ? Math.max(...previous.map(note => note.width))/2 : 0;
        const distance = previous ? Math.max(previousHalf+half+GAP,rhythmicAdvance(group[0].start-previous[0].start)) : 0;
        const center = previous ? centers.at(-1)! + distance : PAD+columnWidth/2;
        if (selected.length && center+columnWidth/2+PAD > usable) break;
        centers.push(center); selected.push(group); required = center+columnWidth/2+PAD;
      }
      if (offset+selected.length < groups.length) {
        // Balance continuations rather than filling one system and stranding
        // one or two attacks on the next. Never exceed the measured capacity.
        const remaining = groups.length-offset, chunks = Math.ceil(remaining/selected.length);
        const count = Math.ceil(remaining/chunks);
        selected.length = count; centers.length = count;
        required = centers.at(-1)!+columnWidth/2+PAD;
      }
      const start = offset ? selected[0][0].start : bar*barFrames;
      offset += selected.length;
      const end = offset < groups.length ? groups[offset][0].start : (bar+1)*barFrames;
      const natural = Math.max(required, Math.min(72,usable));
      const anchors: Anchor[] = [{time:start,x:0}];
      selected.forEach((group,i) => { group.forEach(note => note.x = centers[i]); anchors.push({time:group[0].start,x:centers[i]}); });
      anchors.push({time:end,x:natural});
      // A note at the exact boundary takes precedence over the bar-start anchor.
      const unique = [...new Map(anchors.map(anchor => [anchor.time,anchor])).values()].sort((a,b) => a.time-b.time);
      measures.push({bar,endBar:bar+1,start,end,continuation:start !== bar*barFrames,x:0,width:natural,row:0,anchors:unique,frets:selected.flat()});
    } while (offset < groups.length);
  }
  // Balanced line breaking: minimize unused row width without squeezing labels.
  const costs = new Array(measures.length+1).fill(Infinity), breaks = new Array(measures.length).fill(0); costs[measures.length] = 0;
  for (let i = measures.length-1; i >= 0; i--) {
    let used = 0;
    for (let j = i; j < measures.length; j++) {
      used += measures[j].width;
      if (used > usable+0.01 && j > i) break;
      const slack = Math.max(0,usable-used)/usable;
      // Prefer fewer systems first; balance their whitespace second. Otherwise
      // the whitespace objective can strand perfectly compatible bars alone.
      const cost = 10+slack*slack*(j === measures.length-1 ? 0.25 : 1)+costs[j+1];
      if (cost < costs[i]) { costs[i] = cost; breaks[i] = j+1; }
    }
  }
  let row = 0;
  for (let i = 0; i < measures.length; row++) {
    const end = Math.max(i+1,breaks[i]), items = measures.slice(i,end), used = items.reduce((sum,item) => sum+item.width,0);
    // Dense measures can use a little breathing room. Sparse and collapsed
    // measures have tightly capped flexibility instead of uniform stretching.
    const capacities = items.map(item => item.frets.length ? Math.min(item.width*0.16,Math.max(0,item.anchors.length-2)*5, item.frets.length <= 2 ? 10 : Infinity) : 0);
    const capacity = capacities.reduce((sum,value) => sum+value,0), extra = Math.min(Math.max(0,usable-used),capacity);
    let x = MARGIN+GUTTER;
    items.forEach((item,index) => {
      const addition = capacity ? extra*capacities[index]/capacity : 0;
      const weights = item.anchors.slice(1).map((anchor,i) => rhythmicWeight(anchor.time-item.anchors[i].time));
      const totalWeight = weights.reduce((sum,value) => sum+value,0);
      let progress = 0;
      item.x = x; item.row = row; item.width += addition;
      item.anchors = item.anchors.map((anchor,i) => { if (i) progress += weights[i-1]; return {...anchor,x:x+anchor.x+(totalWeight ? addition*progress/totalWeight : 0)}; });
      const positions = new Map(item.anchors.map(anchor => [anchor.time,anchor.x]));
      item.frets.forEach(note => { note.x = positions.get(note.start)!; note.y = row*rowHeight+stringTop+note.string*stringGap; note.row = row; });
      x += item.width;
    });
    i = end;
  }
  const height = (row-1)*rowHeight+stringTop+(labels.length-1)*stringGap+(hasChordOverlays ? 36 : 14);
  return {width,height,rowHeight,stringTop,stringGap,labels,measures,frets:measures.flatMap(measure => measure.frets),rowCount:row};
}

export function practiceTabPosition(layout: PracticeTabLayout, frame: number) {
  const measures = layout.measures;
  let low = 0, high = measures.length-1;
  while (low < high) { const mid = (low+high+1)>>1; if (measures[mid].start <= frame) low = mid; else high = mid-1; }
  const measure = measures[low], anchors = measure.anchors;
  let a = 0, b = anchors.length-1;
  while (a < b) { const mid = (a+b+1)>>1; if (anchors[mid].time <= frame) a = mid; else b = mid-1; }
  const left = anchors[a], right = anchors[Math.min(a+1,anchors.length-1)];
  const ratio = right.time > left.time ? Math.max(0,Math.min(1,(frame-left.time)/(right.time-left.time))) : 0;
  return {x:left.x+(right.x-left.x)*ratio,y:measure.row*layout.rowHeight,row:measure.row,measure,index:low};
}
