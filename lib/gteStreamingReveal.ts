import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
import { ghostNotes, type StreamingGhostLayers } from "./gteStreamingGhosts";
const key = (lane: EditorSnapshot, kind: string, id: number) => `${lane.id}:${kind}:${id}`;

const DEFAULT_CADENCE_MS = 4000, MIN_CADENCE_MS = 2000, MAX_CADENCE_MS = 10000;
const LAG = 1.15;            // drain slightly slower than arrival so the head never starves between batches
const MAX_SPEED = 6;         // seconds of music per second of wall time while still receiving
const MIN_SPEED = .5, COMPLETE_MIN_SPEED = 2;
const COMPLETE_DRAIN_MS = 1500;
const SPEED_EASE_MS = 700;   // speed changes glide instead of jumping at batch boundaries
const SILENCE_SKIP_S = 1, SILENCE_BOOST = 3;

/** LLM-style reveal. Inference arrives in irregular batches; the editor shows it
 * through a single write head that sweeps the song left to right at a smoothly
 * varying speed (a jitter buffer):
 *  - settled notes (already optimized with full bar context) turn solid as the
 *    head passes them, via a short translucent preview;
 *  - raw, not-yet-settled notes appear as ghosts as the head passes them, and are
 *    replaced in place by the settled version once their bar settles. */
export function createStreamingReveal({ previewMs = 0 }: { previewMs?: number } = {}) {
  let source: CanvasSnapshot | null = null;
  let completeSource = false;
  let provisional: StreamingGhostLayers = {};
  let draftTimes: number[] = [];
  let visible = new Set<string>();
  let queue: Array<{ time: number; keys: string[] }> = [];
  let staged: Array<{ time: number; keys: string[]; due: number }> = [];
  let last: CanvasSnapshot | null = null;
  let lastArrival = 0, cadenceMs = DEFAULT_CADENCE_MS;
  let through = 0, revealedThrough = 0, animationMs = 0;
  let head = -1, bound = 0, speed = 0;
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
  const solidify = (group: { time: number; keys: string[] }) => {
    revealedThrough = Math.max(revealedThrough, group.time / 1000);
    group.keys.forEach(id => visible.add(id));
    return true;
  };
  const stage = (group: { time: number; keys: string[] }) => {
    if (previewMs) staged.push({ ...group, due: animationMs + previewMs }); else solidify(group);
  };
  /** Stage every queued group the head has already passed. */
  const release = () => { let any = false; while (queue.length && queue[0].time / 1000 <= head) { stage(queue.shift()!); any = true; } return any; };
  const nextDraftAfter = (seconds: number) => draftTimes.find(time => time > seconds) ?? Infinity;
  return {
    receive(next: CanvasSnapshot, complete = false, processedSeconds = 0, drafts: StreamingGhostLayers = {}) {
      const started = head >= 0;
      completeSource = complete;
      provisional = complete ? {} : drafts;
      through = Math.max(through, processedSeconds, ...next.editors.map(lane => lane.notes.reduce((end, note) => Math.max(end, note.startTime / lane.fps), lane.chords.reduce((end, chord) => Math.max(end, chord.startTime / lane.fps), 0))));
      draftTimes = next.editors.flatMap(lane => (provisional[lane.id] ?? []).map(ghost => ghost.start / lane.fps)).sort((a, b) => a - b);
      bound = Math.max(through, draftTimes.at(-1) ?? 0);
      const now = Date.now();
      if (lastArrival) cadenceMs = Math.max(MIN_CADENCE_MS, Math.min(MAX_CADENCE_MS, cadenceMs * .7 + (now - lastArrival) * .3));
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
      // The write head starts at the first real music, so there is no dead wait.
      if (!started) {
        const first = Math.min((queue[0]?.time ?? Infinity) / 1000, draftTimes[0] ?? Infinity);
        if (Number.isFinite(first)) head = first;
      } else release();
      return rebuild();
    },
    advance(elapsedMs?: number) {
      const delta = elapsedMs ?? 0; animationMs += delta;
      let changed = false;
      const ready = staged.filter(group => group.due <= animationMs); staged = staged.filter(group => group.due > animationMs);
      for (const group of ready) changed = solidify(group);
      if (elapsedMs === undefined) {
        // Step mode: reveal exactly the next onset group.
        const group = queue.shift();
        if (group) { head = Math.max(head, group.time / 1000); stage(group); }
      } else if (head >= 0 && delta > 0) {
        const buffer = Math.max(0, bound - head);
        // Proportional speed alone only approaches the bound asymptotically; a floor guarantees arrival.
        const target = buffer <= 0 ? 0 : completeSource ? Math.max(COMPLETE_MIN_SPEED, buffer / (COMPLETE_DRAIN_MS / 1000)) : Math.max(MIN_SPEED, Math.min(MAX_SPEED, buffer / (cadenceMs * LAG / 1000)));
        speed = completeSource ? target : speed + (target - speed) * Math.min(1, delta / SPEED_EASE_MS);
        const nextTime = Math.min((queue[0]?.time ?? Infinity) / 1000, nextDraftAfter(head));
        const boost = nextTime - head > SILENCE_SKIP_S ? SILENCE_BOOST : 1;
        head = Math.min(bound, head + speed * boost * delta / 1000);
        if (release()) changed = true;
      }
      if (head >= 0) revealedThrough = Math.max(revealedThrough, Math.min(through, head));
      if (completeSource && !queue.length && !staged.length) { revealedThrough = Math.max(revealedThrough, through); head = Math.max(head, bound); }
      // Solid notes are the only part of the head's progress that changes the score.
      return changed || elapsedMs === undefined ? rebuild() : last;
    },
    ghosts(): StreamingGhostLayers {
      if (!source || (completeSource && !queue.length && !staged.length)) return {};
      const previews = new Set(staged.flatMap(group => group.keys));
      return Object.fromEntries(source.editors.map(lane => [lane.id, [
        ...ghostNotes(lane, previews),
        ...(head >= 0 ? (provisional[lane.id] ?? []).filter(ghost => ghost.start / lane.fps <= head) : []),
      ]]));
    },
    /** Position of the write head in seconds, or null before streaming starts / after it ends. */
    headSeconds: () => !source || head < 0 || (completeSource && !queue.length && !staged.length) ? null : head,
    /** Lanes the model has produced anything for, whether or not the head has reached it yet. */
    knownLanes: () => source ? source.editors.filter(lane => lane.notes.length || lane.chords.length || provisional[lane.id]?.length).map(lane => lane.id) : [],
    pending: () => queue.length + staged.length,
    throughSeconds: () => revealedThrough,
    reset() { source = null; completeSource = false; provisional = {}; draftTimes = []; last = null; queue = []; visible = new Set(); through = 0; revealedThrough = 0; animationMs = 0; staged = []; lastArrival = 0; cadenceMs = DEFAULT_CADENCE_MS; head = -1; bound = 0; speed = 0; },
  };
}
