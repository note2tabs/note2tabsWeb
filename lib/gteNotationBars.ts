import type { EditorSnapshot } from "../types/gte";
import { scoreEvents, validNotationTie } from "./gteNotation";

type Notation = NonNullable<EditorSnapshot["notation"]>;
const barLength = (lane: EditorSnapshot) => lane.framesPerMessure || 480;
const barCount = (lane: EditorSnapshot) => Math.max(1, Math.ceil(lane.totalFrames / barLength(lane)));
const indices = (lane: EditorSnapshot, bars: number[]) => [...new Set(bars.filter(index => Number.isInteger(index) && index >= 0 && index < barCount(lane)))].sort((a, b) => a - b);
/** Projection into selected measure time, in O(log selected measures). */
function selectedTimeAt(selected: number[], size: number, frame: number) {
  const bar = Math.floor(frame / size);
  let left = 0, right = selected.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (selected[middle] < bar) left = middle + 1; else right = middle;
  }
  return left * size + (selected[left] === bar ? frame - bar * size : 0);
}
const keysForChord = (chord: EditorSnapshot["chords"][number], id: number, keys: Map<string, string>) => {
  for (let member = 0; member < Math.max(chord.originalMidi.length, chord.currentTabs.length); member++) keys.set(`c:${chord.id}:${member}`, `c:${id}:${member}`);
};
const remap = (links: Notation["ties"], keys: Map<string, string>) => (links ?? []).flatMap(link => {
  const from = keys.get(link.from), to = keys.get(link.to);
  return from && to ? [{ from, to }] : [];
});
function finish(lane: EditorSnapshot): EditorSnapshot {
  const events = new Map(scoreEvents(lane).map(event => [event.key, event]));
  return { ...lane, optimalsByTime: {},
    cutPositionsWithCoords: [[[0, lane.totalFrames], [2, 0]]],
    notation: { ...lane.notation,
      ties: (lane.notation?.ties ?? []).filter(link => {
        const from = events.get(link.from), to = events.get(link.to);
        return from && to && validNotationTie(from, to);
      }),
      slurs: (lane.notation?.slurs ?? []).filter(link => events.has(link.from) && events.has(link.to)),
    } };
}

/** Copy the musical interval of selected measures, including held notes that
 * enter from a preceding measure. Disjoint selections are packed in bar order. */
export function selectNotationBars(lane: EditorSnapshot, bars: number[]): EditorSnapshot | null {
  const selected = indices(lane, bars), size = barLength(lane);
  if (!selected.length) return null;
  const clip = (start: number, length: number) => {
    const output = selectedTimeAt(selected, size, start), duration = selectedTimeAt(selected, size, start + length) - output;
    return duration > 0 ? { start: output, length: duration } : null;
  };
  const keys = new Map<string, string>(), noteIds = new Map<number, number>();
  const notes: EditorSnapshot["notes"] = [], chords: EditorSnapshot["chords"] = [];
  for (const note of lane.notes) {
    const timing = clip(note.startTime, note.length);
    if (!timing) continue;
    const id = notes.length + 1;
    keys.set(`n:${note.id}`, `n:${id}`); noteIds.set(note.id, id);
    notes.push({ ...structuredClone(note), id, startTime: timing.start, length: timing.length });
  }
  for (const chord of lane.chords) {
    const timing = clip(chord.startTime, chord.length);
    if (!timing) continue;
    const id = chords.length + 1;
    keysForChord(chord, id, keys);
    chords.push({ ...structuredClone(chord), id, startTime: timing.start, length: timing.length });
  }
  const rests = (lane.notation?.rests ?? []).flatMap(rest => {
    const timing = clip(rest.start, rest.length);
    return timing ? [{ ...rest, id: rest.id, start: timing.start, length: timing.length }] : [];
  });
  return finish({ ...lane, id: "clipboard", name: "Clipboard", totalFrames: selected.length * size, notes, chords,
    noteEffects: (lane.noteEffects ?? []).flatMap(effect => {
      const startNoteId = noteIds.get(effect.startNoteId), endNoteId = noteIds.get(effect.endNoteId);
      return startNoteId !== undefined && endNoteId !== undefined ? [{ ...effect, startNoteId, endNoteId }] : [];
    }),
    notation: { rests, ties: remap(lane.notation?.ties, keys), slurs: remap(lane.notation?.slurs, keys) } });
}

/** Delete measure time, trimming held notes rather than erasing notes which
 * merely cross a deleted boundary. At least one measure must remain. */
export function deleteNotationBars(lane: EditorSnapshot, bars: number[]): EditorSnapshot | null {
  const selected = indices(lane, bars), size = barLength(lane);
  if (!selected.length || selected.length >= barCount(lane)) return null;
  const mapFrame = (frame: number) => frame - selectedTimeAt(selected, size, frame);
  const notes = lane.notes.flatMap(note => {
    const startTime = mapFrame(note.startTime), length = mapFrame(note.startTime + note.length) - startTime;
    return length > 0 ? [{ ...structuredClone(note), startTime, length }] : [];
  });
  const chords = lane.chords.flatMap(chord => {
    const startTime = mapFrame(chord.startTime), length = mapFrame(chord.startTime + chord.length) - startTime;
    return length > 0 ? [{ ...structuredClone(chord), startTime, length }] : [];
  });
  const noteIds = new Set(notes.map(note => note.id));
  return finish({ ...lane, notes, chords, totalFrames: lane.totalFrames - selected.length * size,
    timelineOffsetFrames: lane.timelineOffsetFrames === undefined ? undefined : mapFrame(lane.timelineOffsetFrames),
    noteEffects: (lane.noteEffects ?? []).filter(effect => noteIds.has(effect.startNoteId) && noteIds.has(effect.endNoteId)),
    notation: { ...lane.notation, rests: (lane.notation?.rests ?? []).flatMap(rest => {
      const start = mapFrame(rest.start), length = mapFrame(rest.start + rest.length) - start;
      return length > 0 ? [{ ...rest, start, length }] : [];
    }) } });
}

/** Insert a bar clipboard with new IDs, keeping both staffs/voices, explicit
 * rests, and internal connections. Existing music moves in one undoable edit. */
export function insertNotationBars(lane: EditorSnapshot, insertIndex: number, clipboard: EditorSnapshot): EditorSnapshot {
  const size = barLength(lane), at = Math.max(0, Math.min(barCount(lane), Math.round(insertIndex))) * size;
  const duration = Math.max(size, clipboard.totalFrames);
  const shift = (start: number, length: number) => ({ start: start >= at ? start + duration : start, length: start < at && start + length > at ? length + duration : length });
  let nextNote = lane.notes.reduce((max, note) => Math.max(max, note.id), 0) + 1;
  let nextChord = lane.chords.reduce((max, chord) => Math.max(max, chord.id), 0) + 1;
  let nextRest = (lane.notation?.rests ?? []).reduce((max, rest) => Math.max(max, rest.id), 0) + 1;
  let nextEffect = (lane.noteEffects ?? []).reduce((max, effect) => Math.max(max, effect.id), 0) + 1;
  const keys = new Map<string, string>(), noteIds = new Map<number, number>();
  const notes = lane.notes.map(note => { const timing = shift(note.startTime, note.length); return { ...structuredClone(note), startTime: timing.start, length: timing.length }; });
  for (const note of clipboard.notes) {
    const id = nextNote++;
    keys.set(`n:${note.id}`, `n:${id}`); noteIds.set(note.id, id);
    notes.push({ ...structuredClone(note), id, startTime: note.startTime + at });
  }
  const chords = lane.chords.map(chord => { const timing = shift(chord.startTime, chord.length); return { ...structuredClone(chord), startTime: timing.start, length: timing.length }; });
  for (const chord of clipboard.chords) {
    const id = nextChord++;
    keysForChord(chord, id, keys);
    chords.push({ ...structuredClone(chord), id, startTime: chord.startTime + at });
  }
  const rests = (lane.notation?.rests ?? []).map(rest => ({ ...rest, ...shift(rest.start, rest.length) }));
  rests.push(...(clipboard.notation?.rests ?? []).map(rest => ({ ...rest, id: nextRest++, start: rest.start + at })));
  return finish({ ...lane, notes: notes.sort((a, b) => a.startTime - b.startTime || a.id - b.id), chords: chords.sort((a, b) => a.startTime - b.startTime || a.id - b.id),
    totalFrames: lane.totalFrames + duration,
    timelineOffsetFrames: lane.timelineOffsetFrames === undefined ? undefined : lane.timelineOffsetFrames >= at ? lane.timelineOffsetFrames + duration : lane.timelineOffsetFrames,
    noteEffects: [...(lane.noteEffects ?? []), ...(clipboard.noteEffects ?? []).flatMap(effect => {
      const startNoteId = noteIds.get(effect.startNoteId), endNoteId = noteIds.get(effect.endNoteId);
      return startNoteId !== undefined && endNoteId !== undefined ? [{ ...effect, id: nextEffect++, startNoteId, endNoteId }] : [];
    })],
    notation: { rests, ties: [...(lane.notation?.ties ?? []), ...remap(clipboard.notation?.ties, keys)], slurs: [...(lane.notation?.slurs ?? []), ...remap(clipboard.notation?.slurs, keys)] } });
}
