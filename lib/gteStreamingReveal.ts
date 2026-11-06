import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
const key = (lane: EditorSnapshot, kind: string, id: number) => `${lane.id}:${kind}:${id}`;
/** Source processing may jump ahead. Reveal simultaneous onsets together in
 * chronological order, bounded to a few editor renders per second. */
export function createStreamingReveal() {
  let source: CanvasSnapshot | null = null;
  let visible = new Set<string>();
  let queue: Array<{ time: number; keys: string[] }> = [];
  let last: CanvasSnapshot | null = null;
  let lastArrival = 0, cadenceMs = 8000, groupsPerMs = 0, credit = 0;
  let through = 0, revealedThrough = 0;
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
      const now = Date.now();
      if (lastArrival) cadenceMs = Math.max(4000, Math.min(12000, cadenceMs * .7 + (now - lastArrival) * .3));
      lastArrival = now;
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
      if (!queue.length) revealedThrough = Math.max(revealedThrough, through);
      groupsPerMs = queue.length / (complete ? 1500 : cadenceMs);
      credit = 0;
      return rebuild();
    },
    advance(elapsedMs?: number) {
      if (!queue.length) return last;
      // Hold a steady rate until the next arrival, instead of draining each
      // snapshot in a burst. Keep simultaneous hits together across tracks.
      credit += elapsedMs === undefined ? 1 : Math.max(0, elapsedMs) * groupsPerMs;
      const count = Math.min(queue.length, Math.floor(credit));
      if (!count) return last;
      credit -= count;
      for (const group of queue.splice(0, count)) {
        revealedThrough = Math.max(revealedThrough, group.time / 1000);
        for (const id of group.keys) visible.add(id);
      }
      if (!queue.length) revealedThrough = Math.max(revealedThrough, through);
      return rebuild();
    },
    pending: () => queue.length,
    throughSeconds: () => revealedThrough,
    reset() { source = null; last = null; queue = []; visible = new Set(); through = 0; revealedThrough = 0; lastArrival = 0; cadenceMs = 8000; groupsPerMs = 0; credit = 0; },
  };
}
