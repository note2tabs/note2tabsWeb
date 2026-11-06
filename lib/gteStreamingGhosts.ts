import type { EditorSnapshot } from "../types/gte";
/** Display-only primitives: deliberately not Note/Chord objects or snapshots. */
export type StreamingGhost = { key: string; phase: "fake" | "preview"; start: number; length: number; midi: number; tab: [number, number] };
export type StreamingGhostLayers = Record<string, StreamingGhost[]>;
export function ghostNotes(lane: EditorSnapshot, previewKeys: ReadonlySet<string>, frontier: number, fakeHead: number): StreamingGhost[] {
 const result: StreamingGhost[] = [];
 for (const note of lane.notes) if (previewKeys.has(`${lane.id}:n:${note.id}`)) result.push({ key:`n:${note.id}`, phase:"preview", start:note.startTime, length:note.length, midi:note.midiNum, tab:note.tab });
 for (const chord of lane.chords) if (previewKeys.has(`${lane.id}:c:${chord.id}`)) {
  const midis=chord.originalMidi;
  for (let i=0;i<Math.max(midis.length,chord.currentTabs.length);i++) result.push({ key:`c:${chord.id}:${i}`, phase:"preview", start:chord.startTime, length:chord.length, midi:midis[i] ?? 60, tab:chord.currentTabs[i] ?? [0,0] });
 }
 const step=60, first=Math.max(0,Math.floor(frontier*lane.fps/step)+1), last=Math.floor(fakeHead*lane.fps/step);
 const strings=lane.instrumentType === "bass-tab" ? 4 : 6;
 const seed=[...lane.id].reduce((value,char)=>value+char.charCodeAt(0),0), base=lane.notes[0]?.midiNum ?? 60;
 for(let slot=first;slot<=last && slot<first+10;slot++) {
  const start=slot*step;
  if(result.some(note=>Math.abs(note.start-start)<step/2))continue;
  result.push({ key:`fake:${slot}`,phase:"fake",start,length:step*.7,midi:Math.max(24,Math.min(100,base+[-2,0,3,5,0][(slot+seed)%5])),tab:[(slot+seed)%strings,0] });
 }
 return result;
}
