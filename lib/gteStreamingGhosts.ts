import type { EditorSnapshot } from "../types/gte";
/** Display-only primitives: deliberately not Note/Chord objects or snapshots. */
export type StreamingGhost = { key: string; phase: "fake" | "preview"; shape?: "note" | "chord"; showLabel?: boolean; start: number; length: number; midi: number; tab: [number, number] };
export type StreamingGhostLayers = Record<string, StreamingGhost[]>;
export function ghostNotes(lane: EditorSnapshot, previewKeys: ReadonlySet<string>, frontier: number, fakeHead: number): StreamingGhost[] {
 const result: StreamingGhost[] = [];
 for (const note of lane.notes) if (previewKeys.has(`${lane.id}:n:${note.id}`)) result.push({ key:`n:${note.id}`, phase:"preview", start:note.startTime, length:note.length, midi:note.midiNum, tab:note.tab });
 for (const chord of lane.chords) if (previewKeys.has(`${lane.id}:c:${chord.id}`)) {
  const midis=chord.originalMidi;
  for (let i=0;i<Math.max(midis.length,chord.currentTabs.length);i++) result.push({ key:`c:${chord.id}:${i}`, phase:"preview", shape:"chord", start:chord.startTime, length:chord.length, midi:midis[i] ?? 60, tab:chord.currentTabs[i] ?? [0,0] });
 }
 const step=30, first=Math.max(0,Math.floor(frontier*lane.fps/step)+1), last=Math.floor(fakeHead*lane.fps/step);
 const strings=lane.instrumentType === "bass-tab" ? 4 : 6;
 const seed=[...lane.id].reduce((value,char)=>Math.imul(value,31)+char.charCodeAt(0),7), base=lane.notes[0]?.midiNum ?? 60;
 // Stable noise varies the pattern without flickering on every animation tick.
 const noise=(slot:number,salt:number)=>{let value=Math.imul(slot+salt,374761393)^seed;value=Math.imul(value^(value>>>13),1274126177);return ((value^(value>>>16))>>>0)/4294967296;};
 for(let slot=first;slot<=last && slot<first+128;slot++) {
  const start=slot*step;
  if(start>fakeHead*lane.fps || result.some(note=>Math.abs(note.start-start)<step/2))continue;
  const string=Math.floor(noise(slot,23)*strings), stacked=noise(slot,37)>.65;
  const tabTrack=lane.instrumentType === "guitar-tab" || lane.instrumentType === "bass-tab";
  const minimum=lane.instrumentType === "bass-tab" ? 2 : 3;
  const voices=stacked ? tabTrack ? minimum+Math.floor(noise(slot,41)*(lane.instrumentType === "bass-tab" ? 2 : 3)) : 2 : 1;
  const firstString=tabTrack ? Math.min(string,strings-voices) : string;
  const chordLength=Math.round(step*(.45+noise(slot,49)*.3));
  for(let voice=0;voice<voices;voice++) result.push({ key:`fake:${slot}:${voice}`,phase:"fake",shape:voices>1 ? "chord" : "note",showLabel:false,start,length:tabTrack && stacked ? chordLength : Math.round(step*(.45+noise(slot,49+voice)*.3)),midi:Math.max(24,Math.min(100,base+Math.floor(noise(slot,67+voice)*15)-7)),tab:[(firstString+voice)%strings,0] });
 }
 return result;
}

export const streamingGhostColor = (ghost: StreamingGhost) => ghost.shape === "chord" ? "#30bced" : "#24bb8d";
export const streamingGhostFret = (ghost: StreamingGhost) => ghost.phase === "preview" && ghost.showLabel !== false ? String(ghost.tab[1]) : "";

/** Keep every placeholder group intact, or hide it. Real music and real previews
 * own their intervals; fake chords never turn into ragged partial stacks. */
export function cleanStreamingGhosts(lane: EditorSnapshot, ghosts: readonly StreamingGhost[], minimumWidth = 6): StreamingGhost[] {
 const tab=lane.instrumentType === "guitar-tab" || lane.instrumentType === "bass-tab";
 type Span=[number,number];
 const occupied=new Map<number,Span[]>();
 const channel=(note:{tab:[number,number];midi:number})=>tab ? note.tab[0] : note.midi;
 const add=(start:number,length:number,key:number)=>{const list=occupied.get(key) ?? [];list.push([start,start+Math.max(minimumWidth,length)]);occupied.set(key,list);};
 for(const note of lane.notes)add(note.startTime,note.length,channel({tab:note.tab,midi:note.midiNum}));
 for(const chord of lane.chords)for(let i=0;i<(tab ? chord.currentTabs.length : chord.originalMidi.length);i++)add(chord.startTime,chord.length,channel({tab:chord.currentTabs[i] ?? [0,0],midi:chord.originalMidi[i] ?? 60}));
 const merge=()=>{for(const [key,list] of occupied){list.sort((a,b)=>a[0]-b[0]);const merged:Span[]=[];for(const span of list){const last=merged.at(-1);if(last && span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}occupied.set(key,merged);}};
 const overlaps=(ghost:StreamingGhost)=>{
  const list=occupied.get(channel(ghost)) ?? [], end=ghost.start+Math.max(minimumWidth,ghost.length);
  let lo=0,hi=list.length;while(lo<hi){const mid=(lo+hi)>>>1;if(list[mid][1]+minimumWidth<=ghost.start)lo=mid+1;else hi=mid;}
  return lo<list.length && list[lo][0]<end+minimumWidth;
 };
 merge();const result:StreamingGhost[]=[];
 for(const ghost of ghosts.filter(note=>note.phase === "preview")){
  if(overlaps(ghost))continue;result.push(ghost);add(ghost.start,ghost.length,channel(ghost));merge();
 }
 // Even a suppressed provisional preview reserves its space from fake notes.
 for(const ghost of ghosts.filter(note=>note.phase === "preview"))add(ghost.start,ghost.length,channel(ghost));
 merge();const groups=new Map<number,StreamingGhost[]>();
 for(const ghost of ghosts.filter(note=>note.phase === "fake"))groups.set(ghost.start,[...(groups.get(ghost.start) ?? []),ghost]);
 for(const group of groups.values()){
  if(group.some(overlaps))continue;
  result.push(...group);for(const ghost of group)add(ghost.start,ghost.length,channel(ghost));merge();
 }
 return result;
}
