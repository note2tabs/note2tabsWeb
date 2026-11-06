import type { CanvasSnapshot, Chord, EditorSnapshot, Note, TimingMapV2 } from "../types/gte";
import type { TranscriberQuantization, TranscriberTrack } from "./gteApi";
import { frameToSeconds, secondsToFrame } from "./gteTiming";
import { streamingTrackKey } from "./transcriptionPreviewProtocol";
import { quantizeItems } from "./gteQuantize";

type Entity = { kind: "note"; value: Note } | { kind: "chord"; value: Chord };
type Anchor = Entity & { startSeconds: number; lengthSeconds: number };
type Edit = { before: Anchor | null; after: Anchor | null };
type SettingEdit = { field: string; before: unknown; after: unknown };
export type StreamingTrackEdits = { key: string; events: Edit[]; settings: SettingEdit[]; anchors?: Anchor[]; geometryFps?: number };
export type StreamingEdits = { version: 1; tracks: StreamingTrackEdits[] };
export const emptyStreamingEdits = (): StreamingEdits => ({ version: 1, tracks: [] });
const clone = <T,>(value: T): T => structuredClone(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const noteFields = ["midiNum", "tab", "pitchBend", "vibrato", "vibratoSettings", "notationStaff", "notationVoice", "notationVoiceSource", "notationVoiceLocked"];
const chordFields = ["originalMidi", "currentTabs", "ogTabs", "fingering", "fingeringIndex", "root", "quality", "extension", "label", "source", "notationVoice", "notationVoiceSource", "notationVoiceLocked", "notationMemberVoices", "pitchBends", "strums"];
const settings = ["name", "instrumentId", "instrumentType", "program", "tuning", "maxFret", "noteEffects", "notation", "cutPositionsWithCoords"];
const fields = (event: Anchor) => event.kind === "note" ? noteFields : chordFields;
const body = (event: Anchor) => ({ kind: event.kind, startSeconds: event.startSeconds, lengthSeconds: event.lengthSeconds,
  ...Object.fromEntries(fields(event).map(key => [key, (event.value as any)[key]])) });
const entities = (lane: EditorSnapshot): Entity[] => [...lane.notes.map(value => ({ kind: "note" as const, value })), ...lane.chords.map(value => ({ kind: "chord" as const, value }))];
const anchored = (lane: EditorSnapshot): Anchor[] => entities(lane).map(event => ({ ...clone(event), startSeconds: event.value.startTime / lane.fps, lengthSeconds: event.value.length / lane.fps }));
const pitches = (entity: Entity) => entity.kind === "note" ? [entity.value.midiNum] : entity.value.originalMidi;
const pitchMatch = (a: Entity, b: Entity) => {
  const left = pitches(a).map(midi => (midi % 12 + 12) % 12).sort(), right = pitches(b).map(midi => (midi % 12 + 12) % 12).sort();
  return left.every(pitch => right.includes(pitch)) || right.every(pitch => left.includes(pitch));
};

/** Only explicit editor callbacks create edits. Incoming inference never enters history. */
export function recordStreamingEdit(draft: StreamingEdits, key: string, before: EditorSnapshot, after: EditorSnapshot): StreamingEdits {
  const next = clone(draft), previous = anchored(before), current = anchored(after);
  const track = next.tracks.find(item => item.key === key) ?? { key, events: [], settings: [] };
  if (!next.tracks.includes(track)) next.tracks.push(track);
  track.geometryFps = after.fps;
  const refs = new Set([...previous, ...current].map(event => `${event.kind}:${event.value.id}`));
  for (const ref of refs) {
    const old = previous.find(event => `${event.kind}:${event.value.id}` === ref) ?? null;
    const value = current.find(event => `${event.kind}:${event.value.id}` === ref) ?? null;
    if (equal(old && body(old), value && body(value))) continue;
    const prior = old ? track.events.find(edit => edit.after && edit.after.kind === old.kind &&
      edit.after.value.id === old.value.id) : undefined;
    if (prior) prior.after = value;
    else track.events.push({ before: old, after: value });
  }
  track.events = track.events.filter(edit => !equal(edit.before && body(edit.before), edit.after && body(edit.after)));
  for (const field of settings) {
    const old = (before as any)[field], value = (after as any)[field];
    if (equal(old, value)) continue;
    let edit = track.settings.find(item => item.field === field);
    if (!edit) { edit = { field, before: clone(old), after: clone(value) }; track.settings.push(edit); }
    else edit.after = clone(value);
  }
  track.settings = track.settings.filter(edit => !equal(edit.before, edit.after));
  if (track.settings.some(edit => edit.field === "notation" || edit.field === "noteEffects")) track.anchors = current;
  next.tracks = next.tracks.filter(item => item.events.length || item.settings.length);
  return next;
}

export type StreamingEditContext = {
  /** Original import map before the existing preferred-BPM rebar pass. */
  timingMap?: TimingMapV2;
  quantization?: TranscriberQuantization;
  rhythmScale?: number;
  final?: boolean;
  streamingRhythmScale?: number;
};

function mapper(lane: EditorSnapshot, context: StreamingEditContext) {
  const scale = context.rhythmScale ?? 1, map = context.timingMap;
  const offset = (lane.timelineOffsetFrames ?? 0) / scale;
  const origin = map?.bars.length ? frameToSeconds(map, offset) : offset / lane.fps;
  const bar = map?.bars[0], numerator = bar?.timeSignature.numerator ?? lane.timeSignature ?? 4, denominator = bar?.timeSignature.denominator ?? lane.timeSignatureBottom ?? 4;
  const step = 480 * denominator / (numerator * Number((context.quantization?.subdivision ?? "1/16").slice(2)));
  const rawFrame = (seconds: number) => map?.bars.length ? secondsToFrame(map, origin + seconds) : seconds * lane.fps / scale;
  return {
    tolerance: context.final ? Math.max(1, step * scale / 2 + 1) : .01,
    time: (event: Anchor, quantize = context.final) => {
      const start = rawFrame(event.startSeconds), length = Math.max(1, rawFrame(event.startSeconds + event.lengthSeconds) - start);
      const snapped = quantize && context.quantization?.enabled
        ? quantizeItems([{ id: 1, start: start - offset, length, keys: pitches(event).map(String) }], { step, strength: context.quantization.strength ?? 1, quantizeLength: context.quantization.quantizeDurations !== false }).get(1)
        : undefined;
      return { startTime: (snapped ? snapped.start + offset : start) * scale, length: (snapped?.length ?? length) * scale };
    },
  };
}

function match(lane: EditorSnapshot, event: Anchor, map: ReturnType<typeof mapper>, final: boolean): Entity | undefined {
  const target = map.time(event).startTime;
  return entities(lane).filter(candidate => Math.abs(candidate.value.startTime - target) <= map.tolerance && pitchMatch(event, candidate))
    .sort((a, b) => Math.abs(a.value.startTime - target) - Math.abs(b.value.startTime - target) ||
      Number(b.kind === event.kind) - Number(a.kind === event.kind) ||
      Number(!final && b.value.id === event.value.id) - Number(!final && a.value.id === event.value.id) || a.value.id - b.value.id)[0];
}

/** Merge field-level edits over a pristine baseline. Unedited events are left intact. */
export function applyStreamingTrackEdits(source: EditorSnapshot, edits: StreamingTrackEdits, context: StreamingEditContext = {}): EditorSnapshot {
  const lane = clone(source), map = mapper(lane, context);
  const nextId = (kind: Entity["kind"]) => Math.max(0, ...(kind === "note" ? lane.notes : lane.chords).map(event => event.id)) + 1;
  const remove = (entity: Entity) => {
    if (entity.kind === "note") lane.notes = lane.notes.filter(note => note.id !== entity.value.id);
    else lane.chords = lane.chords.filter(chord => chord.id !== entity.value.id);
  };
  const insert = (event: Anchor, value: Note | Chord = clone(event.value)) => {
    const id = context.final && value.id <= 0 || (event.kind === "note" ? lane.notes : lane.chords).some(item => item.id === value.id) ? nextId(event.kind) : value.id;
    const converted = { ...value, ...map.time(event), id };
    if (event.kind === "note") lane.notes.push(converted as Note); else lane.chords.push(converted as Chord);
  };
  // Resolve against the baseline before mutating it. Moving/swapping equal
  // pitches must not cause a later edit to target an already-moved note.
  const targets = edits.events.map(edit => edit.before ? match(lane, edit.before, map, Boolean(context.final)) : undefined);
  for (const [index, edit] of edits.events.entries()) {
    let candidate = targets[index];
    if (candidate?.kind === "chord" && edit.before?.kind === "chord" &&
        candidate.value.originalMidi.length > edit.before.value.originalMidi.length) {
      // A later onset may join this provisional chord during final quantization.
      // Isolate the edited members rather than replacing/deleting the new tones.
      const chord = candidate.value, indices: number[] = [];
      for (const pitch of edit.before.value.originalMidi) {
        let member = chord.originalMidi.findIndex((value, i) => value === pitch && !indices.includes(i));
        if (member < 0) member = chord.originalMidi.findIndex((value, i) => value % 12 === pitch % 12 && !indices.includes(i));
        if (member >= 0) indices.push(member);
      }
      if (indices.length === edit.before.value.originalMidi.length) {
        const extracted = { ...clone(chord), id: nextId("chord") };
        for (const field of ["originalMidi", "currentTabs", "ogTabs", "notationMemberVoices", "velocities", "pitchBends"] as const) {
          const values = chord[field];
          if (!values) continue;
          (extracted as any)[field] = indices.map(i => clone(values[i]));
          (chord as any)[field] = values.filter((_, i) => !indices.includes(i));
        }
        lane.chords.push(extracted);
        candidate = { kind: "chord", value: extracted };
      }
    }
    if (candidate && edit.after && edit.before && candidate.kind === edit.after.kind) {
      const before = body(edit.before) as any, after = body(edit.after) as any;
      const time = map.time(edit.after);
      for (const field of fields(edit.after)) if (!equal(before[field], after[field])) (candidate.value as any)[field] = clone(after[field]);
      if (before.startSeconds !== after.startSeconds) candidate.value.startTime = time.startTime;
      if (before.lengthSeconds !== after.lengthSeconds) candidate.value.length = time.length;
    } else if (candidate?.kind === "chord" && edit.before?.kind === "note") {
      // Final quantization can place a formerly separate note inside a chord.
      // Extract only that member, preserving the other chord tones.
      const chord = candidate.value, midi = edit.before.value.midiNum;
      let member = chord.originalMidi.indexOf(midi);
      if (member < 0) member = chord.originalMidi.findIndex(value => value % 12 === midi % 12);
      if (member >= 0) {
        const extracted: Note = { id: nextId("note"), startTime: chord.startTime, length: chord.length, midiNum: chord.originalMidi[member],
          tab: chord.currentTabs[member] ?? edit.before.value.tab, optimals: [], notationVoice: chord.notationMemberVoices?.[member] ?? chord.notationVoice };
        chord.originalMidi.splice(member, 1); chord.currentTabs.splice(member, 1); chord.ogTabs.splice(member, 1);
        chord.notationMemberVoices?.splice(member, 1); chord.velocities?.splice(member, 1); chord.pitchBends?.splice(member, 1);
        if (!chord.originalMidi.length) remove(candidate);
        if (edit.after?.kind === "note") {
          const before = body(edit.before) as any, after = body(edit.after) as any;
          for (const field of noteFields) if (!equal(before[field], after[field])) (extracted as any)[field] = clone(after[field]);
          const time = map.time(edit.after);
          if (before.startSeconds !== after.startSeconds) extracted.startTime = time.startTime;
          if (before.lengthSeconds !== after.lengthSeconds) extracted.length = time.length;
          lane.notes.push(extracted);
        }
      }
    } else {
      if (candidate) remove(candidate);
      if (edit.after) insert(edit.after);
    }
  }
  for (const edit of edits.settings) {
    if (edit.field === "noteEffects" || edit.field === "notation" || edit.field === "cutPositionsWithCoords") continue;
    (lane as any)[edit.field] = clone(edit.after);
  }
  const noteIds = new Map<number, number>(), chordIds = new Map<number, number>();
  for (const anchor of edits.anchors ?? []) {
    const found = match(lane, anchor, map, Boolean(context.final));
    if (found?.kind === "note" && anchor.kind === "note") noteIds.set(anchor.value.id, found.value.id);
    if (found?.kind === "chord" && anchor.kind === "chord") chordIds.set(anchor.value.id, found.value.id);
  }
  const effects = edits.settings.find(edit => edit.field === "noteEffects");
  if (effects) lane.noteEffects = ((effects.after ?? []) as NonNullable<EditorSnapshot["noteEffects"]>).flatMap(effect => {
    const startNoteId = noteIds.get(effect.startNoteId), endNoteId = noteIds.get(effect.endNoteId);
    return startNoteId !== undefined && endNoteId !== undefined ? [{ ...effect, startNoteId, endNoteId }] : [];
  });
  const notation = edits.settings.find(edit => edit.field === "notation");
  if (notation) {
    const value = clone(notation.after ?? {}) as NonNullable<EditorSnapshot["notation"]>;
    const reference = (key: string) => {
      const [kind, raw, member] = key.split(":"), id = (kind === "n" ? noteIds : chordIds).get(Number(raw));
      return id === undefined ? null : `${kind}:${id}${member === undefined ? "" : `:${member}`}`;
    };
    for (const field of ["ties", "slurs"] as const) value[field] = value[field]?.flatMap(connection => {
      const from = reference(connection.from), to = reference(connection.to); return from && to ? [{ from, to }] : [];
    });
    value.rests = value.rests?.map(rest => ({ ...rest, ...(() => {
      const anchor = { kind: "note", value: { midiNum: 60 }, startSeconds: rest.start / (edits.geometryFps ?? source.fps), lengthSeconds: rest.length / (edits.geometryFps ?? source.fps) } as Anchor;
      const time = map.time(anchor); return { start: time.startTime, length: time.length };
    })() }));
    lane.notation = { ...lane.notation, ...value };
  }
  const coordinates = edits.settings.find(edit => edit.field === "cutPositionsWithCoords");
  if (coordinates) lane.cutPositionsWithCoords = (clone(coordinates.after) as EditorSnapshot["cutPositionsWithCoords"]).map(([range, coord]) => {
    const fps = edits.geometryFps ?? source.fps;
    const start = map.time({ kind: "note", value: { midiNum: 60 }, startSeconds: range[0] / fps, lengthSeconds: (range[1] - range[0]) / fps } as Anchor, false);
    return [[start.startTime, start.startTime + start.length], coord];
  });
  lane.totalFrames = Math.max(lane.totalFrames, Math.ceil(Math.max(0, ...entities(lane).map(event => event.value.startTime + event.value.length)) / 480) * 480);
  return lane;
}

export function applyStreamingEdits(canvas: CanvasSnapshot, draft: StreamingEdits | undefined, importedIds?: readonly string[], tracks?: readonly TranscriberTrack[], context: StreamingEditContext = {}): CanvasSnapshot {
  if (!draft?.tracks.length) return canvas;
  const ids = importedIds ?? canvas.editors.map(lane => lane.id);
  const editors = canvas.editors.map(lane => {
    const index = ids.indexOf(lane.id); if (index < 0) return lane;
    const key = streamingTrackKey(tracks?.[index] ?? lane);
    const edits = draft.tracks.find(item => item.key === key);
    return edits ? applyStreamingTrackEdits(lane, edits, context) : lane;
  });
  return { ...canvas, editors };
}

const storageKey = (jobId: string) => `note2tabs:stream-edits:v1:${jobId}`;
export function readStreamingEdits(jobId: string): StreamingEdits {
  if (typeof window === "undefined") return emptyStreamingEdits();
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(jobId)) ?? "null");
    return value?.version === 1 && Array.isArray(value.tracks) && value.tracks.every((track: any) => typeof track.key === "string" && Array.isArray(track.events) && Array.isArray(track.settings)) ? value : emptyStreamingEdits();
  } catch { return emptyStreamingEdits(); }
}
export function saveStreamingEdits(jobId: string, draft: StreamingEdits) {
  window.localStorage.setItem(storageKey(jobId), JSON.stringify(draft));
}
export function clearStreamingEdits(jobId: string) { try { window.localStorage.removeItem(storageKey(jobId)); } catch { /* A confirmed import must not fail because device storage is unavailable. */ } }
