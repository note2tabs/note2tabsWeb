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
 const step=30, first=Math.max(0,Math.floor(frontier*lane.fps/step)+1), last=Math.floor(fakeHead*lane.fps/step);
 const strings=lane.instrumentType === "bass-tab" ? 4 : 6;
 const seed=[...lane.id].reduce((value,char)=>Math.imul(value,31)+char.charCodeAt(0),7), base=lane.notes[0]?.midiNum ?? 60;
 // Stable noise varies the pattern without flickering on every animation tick.
 const noise=(slot:number,salt:number)=>{let value=Math.imul(slot+salt,374761393)^seed;value=Math.imul(value^(value>>>13),1274126177);return ((value^(value>>>16))>>>0)/4294967296;};
 for(let slot=first;slot<=last && slot<first+128;slot++) {
  const start=slot*step+Math.round(noise(slot,11)*step*.3);
  if(start>fakeHead*lane.fps || result.some(note=>Math.abs(note.start-start)<step/2))continue;
  const string=Math.floor(noise(slot,23)*strings), stacked=noise(slot,37)>.65;
  const tabTrack=lane.instrumentType === "guitar-tab" || lane.instrumentType === "bass-tab";
  const minimum=lane.instrumentType === "bass-tab" ? 2 : 3;
  const voices=stacked ? tabTrack ? minimum+Math.floor(noise(slot,41)*(lane.instrumentType === "bass-tab" ? 2 : 3)) : 2 : 1;
  const firstString=tabTrack ? Math.min(string,strings-voices) : string;
  const chordLength=Math.round(step*(.5+noise(slot,49)*1.6));
  for(let voice=0;voice<voices;voice++) result.push({ key:`fake:${slot}:${voice}`,phase:"fake",start,length:tabTrack && stacked ? chordLength : Math.round(step*(.5+noise(slot,49+voice)*1.6)),midi:Math.max(24,Math.min(100,base+Math.floor(noise(slot,67+voice)*15)-7)),tab:[(firstString+voice)%strings,0] });
 }
 return result;
}
