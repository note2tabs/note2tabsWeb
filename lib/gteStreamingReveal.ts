import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
import { ghostNotes, type StreamingGhostLayers } from "./gteStreamingGhosts";
const key = (lane: EditorSnapshot, kind: string, id: number) => `${lane.id}:${kind}:${id}`;
/** Source processing may jump ahead. Reveal simultaneous onsets together in
 * chronological order, bounded to a few editor renders per second. */
export function createStreamingReveal({ previewMs = 0 }: { previewMs?: number } = {}) {
  let source: CanvasSnapshot | null = null;
  let visible = new Set<string>();
  let queue: Array<{ time: number; keys: string[] }> = [];
  let last: CanvasSnapshot | null = null;
  let lastArrival = 0, cadenceMs = 8000, groupsPerMs = 0, credit = 0;
  let through = 0, revealedThrough = 0, animationMs = 0, fakeHead = 0;
  let staged: Array<{ time: number; keys: string[]; due: number }> = [];
  const rebuild = () => {
    if (!source) return null;
    last = { ...source, editors: source.editors.map(lane => {
      const notes = lane.notes.filter(note => visible.has(key(lane, "n", note.id)));
      const chords = lane.chords.filter(chord => visible.has(key(lane, "c", chord.id)));
      const previous = last?.editors.find(item => item.id === lane.id);
      if (previous && previous.notes.length === notes.length && previous.chords.length === chords.length &&
          notes.every((note, i) => note === previous.notes[i]) && chords.every((chord, i) => chord === previous.chords[i]) &&
          Object.keys(lane).every(field => field === "notes" || field === "chords" || lane[field as keyof EditorSnapshot] === previous[field as keyof EditorSnapshot])) return previous;
      return { ...lane, notes, chords };
    }) };
    return last;
  };
  return {
    receive(next: CanvasSnapshot, complete = false, processedSeconds = 0) {
      through = Math.max(through, processedSeconds, ...next.editors.map(lane => lane.notes.reduce((end, note) => Math.max(end, note.startTime / lane.fps), lane.chords.reduce((end, chord) => Math.max(end, chord.startTime / lane.fps), 0))));
      if (!source) fakeHead=Math.min(through,(next.secondsPerBar || 2)*.85);
      const now = Date.now();
      if (lastArrival) cadenceMs = Math.max(4000, Math.min(12000, cadenceMs * .7 + (now - lastArrival) * .3));
      lastArrival = now;
      source = next;
      const groups = new Map<number, string[]>();
      for (const lane of next.editors) for (const [kind, events] of [["n", lane.notes], ["c", lane.chords]] as const) {
        for (const event of events) {
          const id = key(lane, kind, event.id);
          if (visible.has(id) || staged.some(group => group.keys.includes(id))) continue;
          const time = Math.round(event.startTime / lane.fps * 1000);
          const group = groups.get(time) ?? []; group.push(id); groups.set(time, group);
        }
      }
      queue = [...groups].map(([time, keys]) => ({ time, keys })).sort((a, b) => a.time - b.time);
      if (!queue.length && !staged.length) revealedThrough = Math.max(revealedThrough, through);
      groupsPerMs = queue.length / (complete ? 1500 : cadenceMs);
      credit = 0;
      return rebuild();
    },
    advance(elapsedMs?: number) {
      const delta=elapsedMs ?? 0; animationMs+=delta;
      const bar=source?.secondsPerBar || 2;
      fakeHead=Math.min(through, revealedThrough+bar*.95, Math.max(fakeHead,revealedThrough)+delta/1000);
      let changed=false;
      const solidify=(group: {time:number;keys:string[]})=>{
        if (!visible.size) fakeHead=Math.min(through,group.time/1000+bar*.85);
        revealedThrough=Math.max(revealedThrough,group.time/1000);
        group.keys.forEach(id=>visible.add(id)); changed=true;
      };
      const ready=staged.filter(group=>group.due<=animationMs); staged=staged.filter(group=>group.due>animationMs);
      ready.forEach(solidify);
      credit+=elapsedMs === undefined ? 1 : Math.max(0,delta)*groupsPerMs;
      const count=Math.min(queue.length,Math.floor(credit)); credit-=count;
      for(const group of queue.splice(0,count)) {
        if(previewMs) staged.push({...group,due:animationMs+previewMs}); else solidify(group);
      }
      if(!queue.length && !staged.length) revealedThrough=Math.max(revealedThrough,through);
      return changed ? rebuild() : last;
    },
    ghosts(): StreamingGhostLayers {
      if(!source || (!queue.length && !staged.length))return {};
      const previews=new Set(staged.flatMap(group=>group.keys));
      return Object.fromEntries(source.editors.map(lane=>[lane.id,ghostNotes(lane,previews,revealedThrough,fakeHead)]));
    },
    pending: () => queue.length + staged.length,
    throughSeconds: () => revealedThrough,
    reset() { source = null; last = null; queue = []; visible = new Set(); through = 0; revealedThrough = 0; animationMs=0; fakeHead=0; staged=[]; lastArrival = 0; cadenceMs = 8000; groupsPerMs = 0; credit = 0; },
  };
}
