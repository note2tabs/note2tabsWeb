import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
const key = (lane: EditorSnapshot, kind: string, id: number) => `${lane.id}:${kind}:${id}`;
/** Source processing may jump ahead. Reveal simultaneous onsets together in
 * chronological order, bounded to a few editor renders per second. */
export function createStreamingReveal() {
  let source: CanvasSnapshot | null = null;
  let visible = new Set<string>();
  let queue: Array<{ time: number; keys: string[] }> = [];
  let last: CanvasSnapshot | null = null;
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
    receive(next: CanvasSnapshot) {
      source = next;
      const groups = new Map<number, string[]>();
      for (const lane of next.editors) for (const [kind, events] of [["n", lane.notes], ["c", lane.chords]] as const) {
        for (const event of events) {
          const id = key(lane, kind, event.id);
          if (visible.has(id)) continue;
          const time = Math.round(event.startTime / lane.fps * 1000);
          const group = groups.get(time) ?? []; group.push(id); groups.set(time, group);
        }
      }
      queue = [...groups].map(([time, keys]) => ({ time, keys })).sort((a, b) => a.time - b.time);
      return rebuild();
    },
    advance() {
      if (!queue.length) return last;
      // Catch up within roughly three seconds without one huge paint.
      const count = Math.max(1, Math.ceil(queue.length / 12));
      for (const group of queue.splice(0, count)) for (const id of group.keys) visible.add(id);
      return rebuild();
    },
    pending: () => queue.length,
    reset() { source = null; last = null; queue = []; visible = new Set(); },
  };
}
