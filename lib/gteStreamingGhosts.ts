import type { EditorSnapshot } from "../types/gte";
/** Display-only primitives: deliberately not Note/Chord objects or snapshots.
 * "preview" ghosts come from real inference output. "placeholder" ghosts are purely
 * cosmetic anticipation just ahead of the write head and are never music. */
export type StreamingGhost = { key: string; phase: "preview" | "placeholder"; shape?: "note" | "chord"; showLabel?: boolean; start: number; length: number; midi: number; tab: [number, number] };
export type StreamingGhostLayers = Record<string, StreamingGhost[]>;

/** Notes that are about to become solid, drawn translucent at their final position. */
export function ghostNotes(lane: EditorSnapshot, previewKeys: ReadonlySet<string>): StreamingGhost[] {
 const result: StreamingGhost[] = [];
 for (const note of lane.notes) if (previewKeys.has(`${lane.id}:n:${note.id}`)) result.push({ key:`n:${note.id}`, phase:"preview", start:note.startTime, length:note.length, midi:note.midiNum, tab:note.tab });
 for (const chord of lane.chords) if (previewKeys.has(`${lane.id}:c:${chord.id}`)) {
  const midis=chord.originalMidi;
  for (let i=0;i<Math.max(midis.length,chord.currentTabs.length);i++) result.push({ key:`c:${chord.id}:${i}`, phase:"preview", shape:"chord", start:chord.startTime, length:chord.length, midi:midis[i] ?? 60, tab:chord.currentTabs[i] ?? [0,0] });
 }
 return result;
}

/**
 * Cosmetic "something is being written here" notes in the short stretch ahead of the write head.
 * They are stable (seeded per lane and slot, so they never flicker), disappear once the head
 * passes them, and are hidden wherever real music or a real preview already is
 * (see `cleanStreamingGhosts`). Nothing about them reflects the audio.
 */
export function placeholderGhosts(lane: EditorSnapshot, headSeconds: number, aheadSeconds: number): StreamingGhost[] {
 const fps=lane.fps > 0 ? lane.fps : 240, step=Math.max(6,Math.round(fps/8));
 const first=Math.max(0,Math.floor(headSeconds*fps/step)+1);
 const last=Math.min(Math.floor((headSeconds+aheadSeconds)*fps/step),Math.floor((lane.totalFrames || Infinity)/step)-1);
 const strings=lane.instrumentType === "bass-tab" ? 4 : 6;
 const tabTrack=lane.instrumentType === "guitar-tab" || lane.instrumentType === "bass-tab";
 const minimum=lane.instrumentType === "bass-tab" ? 2 : 3;
 const seed=[...String(lane.id)].reduce((value,char)=>Math.imul(value,31)+char.charCodeAt(0),7), base=lane.notes[0]?.midiNum ?? 60;
 const noise=(slot:number,salt:number)=>{let value=Math.imul(slot+salt,374761393)^seed;value=Math.imul(value^(value>>>13),1274126177);return ((value^(value>>>16))>>>0)/4294967296;};
 const result: StreamingGhost[]=[];
 for(let slot=first;slot<=last && slot<first+96;slot++){
  if(noise(slot,11)>.72)continue; // natural gaps
  const start=slot*step, string=Math.floor(noise(slot,23)*strings), stacked=noise(slot,37)>.7;
  const voices=stacked ? tabTrack ? Math.min(strings,minimum+Math.floor(noise(slot,41)*2)) : 2 : 1;
  const firstString=tabTrack ? Math.min(string,strings-voices) : string;
  const length=Math.round(step*(.45+noise(slot,49)*.3));
  for(let voice=0;voice<voices;voice++) result.push({ key:`ph:${slot}:${voice}`,phase:"placeholder",shape:voices>1 ? "chord" : "note",showLabel:false,start,length,midi:Math.max(24,Math.min(100,base+Math.floor(noise(slot,67+voice)*15)-7)),tab:[(firstString+voice)%strings,0] });
 }
 return result;
}

export const streamingGhostColor = (ghost: StreamingGhost) => ghost.shape === "chord" ? "#30bced" : "#24bb8d";
export const streamingGhostFret = (ghost: StreamingGhost) => ghost.phase === "preview" && ghost.showLabel !== false ? String(ghost.tab[1]) : "";

/** Real music owns its intervals. Real previews are hidden only when they would sit on solid notes or
 * earlier previews; placeholders are kept or hidden as a whole group so a chord never shows ragged. */
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
 for(const ghost of ghosts.filter(item=>item.phase === "preview")){
  if(overlaps(ghost))continue;result.push(ghost);add(ghost.start,ghost.length,channel(ghost));merge();
 }
 // Even a hidden provisional preview reserves its space from placeholders.
 for(const ghost of ghosts.filter(item=>item.phase === "preview"))add(ghost.start,ghost.length,channel(ghost));
 merge();const groups=new Map<number,StreamingGhost[]>();
 for(const ghost of ghosts.filter(item=>item.phase === "placeholder"))groups.set(ghost.start,[...(groups.get(ghost.start) ?? []),ghost]);
 for(const group of groups.values()){
  if(group.some(overlaps))continue;
  result.push(...group);for(const ghost of group)add(ghost.start,ghost.length,channel(ghost));merge();
 }
 return result;
}
