import type { EditorSnapshot } from "../types/gte";
/** Display-only primitives: deliberately not Note/Chord objects or snapshots.
 * Every ghost is derived from real inference output; nothing is invented. */
export type StreamingGhost = { key: string; phase: "preview"; shape?: "note" | "chord"; showLabel?: boolean; start: number; length: number; midi: number; tab: [number, number] };
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

export const streamingGhostColor = (ghost: StreamingGhost) => ghost.shape === "chord" ? "#30bced" : "#24bb8d";
export const streamingGhostFret = (ghost: StreamingGhost) => ghost.showLabel !== false ? String(ghost.tab[1]) : "";

/** Real music owns its intervals: a ghost that would sit on top of a solid note
 * or an earlier ghost on the same string / pitch is hidden. */
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
 for(const ghost of ghosts){
  if(overlaps(ghost))continue;result.push(ghost);add(ghost.start,ghost.length,channel(ghost));merge();
 }
 return result;
}
