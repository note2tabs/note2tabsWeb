import type { Chord, CutWithCoord, EditorSnapshot, Note, NoteEffect, TabCoord } from "../types/gte";
import {
  getAllTabsForMidi,
  getMaxFretFromSnapshot,
  getOpenStringMidiFromSnapshot,
  getTabMidi,
  isBassSnapshot,
} from "./gteTuning";
import { applyNoteFingeringUpdates, getEffectAwareFingeringUpdates } from "./gteNoteEffects";

const FIXED_FRAMES_PER_BAR = 480;
const MAX_EVENT_LENGTH_FRAMES = 800;
const DEFAULT_CUT_COORD: TabCoord = [2, 0];
const cloneTab = (tab: TabCoord): TabCoord => [tab[0], tab[1]];
const clampLength = (length: number) =>
  Math.max(1, Math.min(MAX_EVENT_LENGTH_FRAMES, Math.round(length)));

const clampTab = (
  snapshot: Pick<EditorSnapshot, "maxFret" | "tuning">,
  tab: TabCoord = DEFAULT_CUT_COORD
): TabCoord => {
  const maxFret = getMaxFretFromSnapshot(snapshot);
  const maxString = Math.max(0, getOpenStringMidiFromSnapshot(snapshot).length - 1);
  return [
    Number.isFinite(tab[0]) ? Math.max(0, Math.min(maxString, Math.round(tab[0]))) : 0,
    Number.isFinite(tab[1])
      ? Math.max(0, Math.min(maxFret, Math.round(tab[1])))
      : Math.min(maxFret, DEFAULT_CUT_COORD[1]),
  ];
};

const validTab = (snapshot: Pick<EditorSnapshot, "maxFret" | "tuning">, tab: TabCoord) =>
  Number.isInteger(tab[0]) &&
  Number.isInteger(tab[1]) &&
  tab[0] >= 0 &&
  tab[0] < getOpenStringMidiFromSnapshot(snapshot).length &&
  tab[1] >= 0 &&
  tab[1] <= getMaxFretFromSnapshot(snapshot);

const normalizeCuts = (snapshot: EditorSnapshot): CutWithCoord[] => {
  const totalFrames = Math.max(
    FIXED_FRAMES_PER_BAR,
    Math.round(snapshot.totalFrames || FIXED_FRAMES_PER_BAR)
  );
  const cuts = (Array.isArray(snapshot.cutPositionsWithCoords) ? snapshot.cutPositionsWithCoords : [])
    .map((entry): CutWithCoord => {
      const start = Math.max(0, Math.min(totalFrames - 1, Math.round(entry[0]?.[0] ?? 0)));
      const end = Math.max(start + 1, Math.min(totalFrames, Math.round(entry[0]?.[1] ?? totalFrames)));
      return [[start, end], clampTab(snapshot, entry[1])];
    })
    .filter((entry) => entry[0][1] > entry[0][0])
    .sort((left, right) => left[0][0] - right[0][0]);
  if (!cuts.length) return [[[0, totalFrames], clampTab(snapshot)]];
  cuts[cuts.length - 1][0][1] = totalFrames;
  return cuts;
};

const cutCoordAt = (cuts: CutWithCoord[], time: number): TabCoord => {
  const target = Math.max(0, Math.round(time));
  let low = 0;
  let high = cuts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const region = cuts[middle];
    if (target < region[0][0]) high = middle - 1;
    else if (target >= region[0][1]) low = middle + 1;
    else return cloneTab(region[1]);
  }
  return cloneTab(cuts[0]?.[1] ?? DEFAULT_CUT_COORD);
};

export type NoteChordCluster = { startTime: number; endTime: number; notes: Note[] };

export const clusterTrackNotesIntoChordGroups = (
  notes: Note[],
  timingToleranceFrames: number
): NoteChordCluster[] => {
  const tolerance = Math.max(0, Math.round(timingToleranceFrames));
  const ordered = [...notes].sort(
    (left, right) => left.startTime - right.startTime || left.midiNum - right.midiNum || left.id - right.id
  );
  const clusters: NoteChordCluster[] = [];
  let bounds: { minStart: number; maxStart: number; minEnd: number; maxEnd: number } | null = null;
  ordered.forEach((note) => {
    const start = Math.round(note.startTime);
    const end = start + clampLength(note.length);
    const current = clusters[clusters.length - 1];
    const nextBounds = bounds
      ? {
          minStart: Math.min(bounds.minStart, start),
          maxStart: Math.max(bounds.maxStart, start),
          minEnd: Math.min(bounds.minEnd, end),
          maxEnd: Math.max(bounds.maxEnd, end),
        }
      : { minStart: start, maxStart: start, minEnd: end, maxEnd: end };
    const joins = Boolean(current) &&
      nextBounds.maxStart - nextBounds.minStart <= tolerance &&
      nextBounds.maxEnd - nextBounds.minEnd <= tolerance &&
      nextBounds.maxStart < nextBounds.minEnd;
    if (!current || !joins) {
      clusters.push({ startTime: start, endTime: end, notes: [note] });
      bounds = { minStart: start, maxStart: start, minEnd: end, maxEnd: end };
    } else {
      current.notes.push(note);
      current.startTime = nextBounds.minStart;
      current.endTime = nextBounds.maxEnd;
      bounds = nextBounds;
    }
  });
  return clusters;
};

export const generateOctaveCombos = (baseMidis: number[]) => {
  const base = baseMidis.map((midi) => Math.trunc(Number(midi)));
  const octaves = base.map((midi) => midi + 12);
  const result: number[][] = [];
  const selected: number[] = [];
  const collect = (start: number, size: number) => {
    if (selected.length === size) {
      const combo = [...base, ...selected];
      if (combo.length <= 6) result.push(combo);
      return;
    }
    for (let index = start; index < octaves.length; index += 1) {
      selected.push(octaves[index]);
      collect(index + 1, size);
      selected.pop();
    }
  };
  for (let size = 0; size <= octaves.length; size += 1) collect(0, size);
  return result;
};

export const createPossibleTabs = (
  midis: number[],
  tabsByMidi: Map<number, TabCoord[]> | Record<number, TabCoord[]>
) => {
  const lists = midis.map((midi) => tabsByMidi instanceof Map ? tabsByMidi.get(midi) ?? [] : tabsByMidi[midi] ?? []);
  if (lists.some((tabs) => tabs.length === 0)) return [];
  const result: TabCoord[][] = [];
  const selected: TabCoord[] = [];
  const strings = new Set<number>();
  const search = (index: number) => {
    if (index === lists.length) {
      result.push(selected.map(cloneTab));
      return;
    }
    lists[index].forEach((tab) => {
      if (strings.has(tab[0])) return;
      strings.add(tab[0]);
      selected.push(tab);
      search(index + 1);
      selected.pop();
      strings.delete(tab[0]);
    });
  };
  search(0);
  return result;
};

export const scoreChord = (tabs: TabCoord[]) => {
  const frets = tabs.map((tab) => tab[1]).filter((fret) => fret !== 0);
  const span = frets.length ? Math.max(...frets) - Math.min(...frets) : 0;
  const strings = tabs.map((tab) => tab[0]);
  const gaps = Math.max(...strings) - Math.min(...strings) + 1 - strings.length;
  return span + 2 * gaps;
};

const closestTabs = (
  snapshot: Pick<EditorSnapshot, "tuning" | "maxFret">,
  coord: TabCoord,
  midi: number
) => getOpenStringMidiFromSnapshot(snapshot)
  .map((base, stringIndex) => [stringIndex, Math.trunc(Number(midi)) - base] as TabCoord)
  .filter((tab) => tab[1] >= 0 && tab[1] <= getMaxFretFromSnapshot(snapshot))
  .map((tab, index) => ({
    tab,
    index,
    distance: tab[1] === 0 ? 0 : (coord[0] - tab[0]) ** 2 * 0.1 + ((coord[1] - tab[1]) * 3) ** 2,
  }))
  .sort((left, right) => left.distance - right.distance || left.index - right.index)
  .slice(0, 6)
  .map(({ tab }) => cloneTab(tab));

export const createBackendStyleChordAlternatives = (
  snapshot: Pick<EditorSnapshot, "tuning" | "maxFret">,
  midiContents: number[],
  playCoord: TabCoord = [0, 0]
) => {
  const seen = new Set<number>();
  const midis = midiContents.map(Number).map(Math.trunc).filter(Number.isFinite).filter((midi) => {
    if (seen.has(midi)) return false;
    seen.add(midi);
    return true;
  }).filter((midi) => !seen.has(midi - 12));
  const map = new Map<number, TabCoord[]>();
  [...midis, ...midis.map((midi) => midi + 12)].forEach((midi) => map.set(midi, closestTabs(snapshot, playCoord, midi)));
  return generateOctaveCombos(midis)
    .flatMap((combo) => createPossibleTabs(combo, map))
    .sort((left, right) => scoreChord(left) - scoreChord(right));
};

type OptimizationContext = {
  cuts: CutWithCoord[];
  notes: Note[];
  chords: Chord[];
  effectIds: Set<number>;
  tabs: Map<number, TabCoord[]>;
};

const contextFor = (snapshot: EditorSnapshot): OptimizationContext => ({
  cuts: normalizeCuts(snapshot),
  notes: [...snapshot.notes].sort((a, b) => Math.round(a.startTime) - Math.round(b.startTime) || a.id - b.id),
  chords: [...snapshot.chords].sort((a, b) => Math.round(a.startTime) - Math.round(b.startTime) || a.id - b.id),
  effectIds: new Set((snapshot.noteEffects || []).flatMap((effect) => [effect.startNoteId, effect.endNoteId])),
  tabs: new Map(),
});

const firstPotentialOverlap = <T extends { startTime: number }>(events: T[], start: number) => {
  const minimumStart = start - MAX_EVENT_LENGTH_FRAMES + 1;
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (Math.round(events[middle].startTime) < minimumStart) low = middle + 1;
    else high = middle;
  }
  return low;
};

const noteAlternatives = (snapshot: EditorSnapshot, note: Note, context: OptimizationContext) => {
  const start = Math.round(note.startTime);
  const end = start + clampLength(note.length);
  const midi = note.midiNum || getTabMidi(snapshot, note.tab);
  let candidates = context.tabs.get(midi);
  if (!candidates) {
    const found = getAllTabsForMidi(snapshot, midi);
    candidates = found.length ? found : [clampTab(snapshot)];
    context.tabs.set(midi, candidates);
  }
  const blocked = new Set<number>();
  for (let index = firstPotentialOverlap(context.notes, start); index < context.notes.length; index += 1) {
    const other = context.notes[index];
    const otherStart = Math.round(other.startTime);
    if (otherStart >= end) break;
    if (other.id === note.id) continue;
    if (start < otherStart + clampLength(other.length)) blocked.add(other.tab[0]);
  }
  for (let index = firstPotentialOverlap(context.chords, start); index < context.chords.length; index += 1) {
    const chord = context.chords[index];
    const chordStart = Math.round(chord.startTime);
    if (chordStart >= end) break;
    if (start < chordStart + clampLength(chord.length)) chord.currentTabs.forEach((tab) => blocked.add(tab[0]));
  }
  const coord = cutCoordAt(context.cuts, start);
  const effect = context.effectIds.has(note.id);
  const ranked = candidates.map((tab) => ({
    tab,
    blocked: blocked.has(tab[0]),
    score: !effect && tab[1] === 0 ? 0 : Math.abs(tab[0] - coord[0]) + Math.abs(tab[1] - coord[1]),
  })).sort((a, b) => a.score - b.score || a.tab[0] - b.tab[0] || a.tab[1] - b.tab[1]);
  return ranked.filter((entry) => !entry.blocked).map((entry) => entry.tab);
};

const chordMidis = (snapshot: EditorSnapshot, chord: Chord) => {
  const fromTabs = chord.currentTabs
    .map((tab) => validTab(snapshot, tab) ? getTabMidi(snapshot, tab) : null)
    .filter((midi): midi is number => midi !== null);
  return fromTabs.length ? fromTabs : chord.originalMidi.map(Number).map(Math.trunc).filter(Number.isFinite);
};

const buildChord = (snapshot: EditorSnapshot, notes: Note[], id: number): Chord => ({
  ...(() => {
    const ordered = [...notes].sort(
      (left, right) =>
        (left.midiNum || getTabMidi(snapshot, left.tab)) -
          (right.midiNum || getTabMidi(snapshot, right.tab)) ||
        left.id - right.id
    );
    const startTime = Math.min(...ordered.map((note) => Math.round(note.startTime)));
    const endTime = Math.max(
      ...ordered.map((note) => Math.round(note.startTime) + clampLength(note.length))
    );
    const currentTabs = ordered.map((note) => cloneTab(note.tab));
    return {
      id,
      startTime,
      length: clampLength(endTime - startTime),
      originalMidi: ordered.map((note) => note.midiNum || getTabMidi(snapshot, note.tab)),
      currentTabs,
      ogTabs: currentTabs.map(cloneTab),
      velocities: ordered.map((note) => note.velocity ?? 100),
      pitchBends: ordered.map((note) => Array.isArray(note.pitchBend) ? [...note.pitchBend] : []),
      source: "fingering-optimizer",
    };
  })(),
});

export type FingeringOptimizationResult = { chordGroups: NoteChordCluster[]; createdChordIds: number[] };

export const optimizeTrackFingeringInSnapshot = (
  draft: EditorSnapshot,
  options?: { optimizeChordFingerings?: boolean }
): FingeringOptimizationResult => {
  const bass = isBassSnapshot(draft);
  const tolerance = Math.max(1, Math.round((draft.framesPerMessure || FIXED_FRAMES_PER_BAR) / 32));
  const groups = bass ? [] : clusterTrackNotesIntoChordGroups(draft.notes, tolerance);
  const createdChordIds: number[] = [];
  const chordized = new Set<number>();
  let chordId = draft.chords.reduce((max, chord) => Math.max(max, chord.id), 0) + 1;
  groups.forEach((group) => {
    if (group.notes.length < 2 || group.notes.length > 6) return;
    draft.chords.push(buildChord(draft, group.notes, chordId));
    createdChordIds.push(chordId++);
    group.notes.forEach((note) => chordized.add(note.id));
  });
  if (chordized.size) {
    draft.notes = draft.notes.filter((note) => !chordized.has(note.id));
    draft.noteEffects = (draft.noteEffects || []).filter(
      (effect) => !chordized.has(effect.startNoteId) && !chordized.has(effect.endNoteId)
    );
  }
  const cuts = normalizeCuts(draft);
  const chordCache = new Map<string, TabCoord[][]>();
  if (!bass && options?.optimizeChordFingerings !== false) {
    [...draft.chords].sort((a, b) => a.startTime - b.startTime || a.id - b.id).forEach((chord) => {
      const midis = chordMidis(draft, chord);
      if (!midis.length) return;
      const coord = cutCoordAt(cuts, chord.startTime);
      const key = `${midis.join(",")}|${coord[0]},${coord[1]}`;
      let alternatives = chordCache.get(key);
      if (!alternatives) {
        alternatives = createBackendStyleChordAlternatives(draft, midis, coord);
        chordCache.set(key, alternatives);
      }
      const best = alternatives[0];
      if (!best) return;
      chord.currentTabs = best.map(cloneTab);
      chord.ogTabs = best.map(cloneTab);
      chord.fingering = undefined;
      chord.fingeringIndex = 0;
    });
  }
  const context = contextFor(draft);
  [...draft.notes].sort((a, b) => a.startTime - b.startTime || a.id - b.id).forEach((note) => {
    const alternatives = noteAlternatives(draft, note, context);
    note.optimals = alternatives.map(cloneTab);
    const best = alternatives[0];
    if (!best) return;
    if (context.effectIds.has(note.id)) {
      applyNoteFingeringUpdates(draft, getEffectAwareFingeringUpdates(draft, [{ noteId: note.id, tab: best }]));
    } else {
      note.tab = cloneTab(best);
      note.midiNum = getTabMidi(draft, best, note.midiNum);
    }
  });
  return { chordGroups: groups, createdChordIds };
};

const effectKey = (effect: Pick<NoteEffect, "startNoteId" | "endNoteId">) =>
  `${Math.min(effect.startNoteId, effect.endNoteId)}:${Math.max(effect.startNoteId, effect.endNoteId)}`;

const normalizeEffects = (snapshot: EditorSnapshot) => {
  const notesById = new Map(snapshot.notes.map((note) => [note.id, note]));
  const seen = new Set<string>();
  return (snapshot.noteEffects || []).flatMap((effect): NoteEffect[] => {
    const first = notesById.get(effect.startNoteId);
    const second = notesById.get(effect.endNoteId);
    if (!first || !second || first.id === second.id || first.tab[0] !== second.tab[0]) return [];
    const [start, end] = first.startTime < second.startTime || (first.startTime === second.startTime && first.id <= second.id)
      ? [first, second] : [second, first];
    const blocked = snapshot.notes.some((note) => note.id !== start.id && note.id !== end.id && note.tab[0] === start.tab[0] && Math.round(start.startTime + clampLength(start.length)) <= Math.round(note.startTime) && Math.round(note.startTime) <= Math.round(end.startTime));
    if (blocked) return [];
    const key = effectKey({ startNoteId: start.id, endNoteId: end.id });
    if (seen.has(key)) return [];
    seen.add(key);
    const type = effect.type === 1 ? 1 : effect.type === 2 ? 2 : 0;
    return [{ id: effect.id, type, startNoteId: start.id, endNoteId: end.id, noteEffectLabel: type === 0 ? "b" : type === 1 ? end.tab[1] - start.tab[1] >= 0 ? "h" : "p" : end.tab[1] - start.tab[1] >= 0 ? "/" : "\\" }];
  });
};

export const finalizeOptimizedTrackFingeringInSnapshot = (draft: EditorSnapshot) => {
  let nextId = draft.notes.reduce((max, note) => Math.max(max, note.id), 0) + 1;
  draft.chords = draft.chords.filter((chord) => {
    const tabs = chord.currentTabs.length ? chord.currentTabs : chord.ogTabs;
    const midis = chord.originalMidi.length ? chord.originalMidi : tabs.map((tab) => getTabMidi(draft, tab));
    if (Math.max(tabs.length, midis.length) !== 1) return true;
    if (!tabs[0]) return false;
    draft.notes.push({ id: nextId++, startTime: Math.round(chord.startTime), length: clampLength(chord.length), midiNum: midis[0] ?? getTabMidi(draft, tabs[0]), tab: cloneTab(tabs[0]), optimals: [], velocity: chord.velocities?.[0], pitchBend: chord.pitchBends?.[0] ? [...chord.pitchBends[0]] : undefined });
    return false;
  });
  const events = [
    ...draft.notes.map((event) => ({ kind: "note" as const, event })),
    ...draft.chords.map((event) => ({ kind: "chord" as const, event })),
  ].sort((a, b) => Math.round(a.event.startTime) - Math.round(b.event.startTime) || a.kind.localeCompare(b.kind) || a.event.id - b.event.id);
  if (!isBassSnapshot(draft)) {
    for (let index = 0; index < events.length - 1; index += 1) {
      const current = events[index].event;
      const next = events[index + 1].event;
      const start = Math.round(current.startTime);
      const nextStart = Math.round(next.startTime);
      if (nextStart > start && start + clampLength(current.length) > nextStart) current.length = clampLength(nextStart - start);
    }
  }
  const context = contextFor(draft);
  draft.notes = draft.notes.map((note) => ({ ...note, optimals: noteAlternatives(draft, note, context).map(cloneTab) }));
  draft.noteEffects = normalizeEffects(draft);
};

export const mergeRedundantCutRegionsInSnapshot = (draft: EditorSnapshot) => {
  const merged: CutWithCoord[] = [];
  normalizeCuts(draft).forEach(([range, coord]) => {
    const last = merged[merged.length - 1];
    if (last && last[1][0] === coord[0] && last[1][1] === coord[1]) last[0][1] = Math.max(last[0][1], range[1]);
    else merged.push([[Math.round(range[0]), Math.round(range[1])], cloneTab(coord)]);
  });
  draft.cutPositionsWithCoords = merged.length ? merged : normalizeCuts(draft);
};
