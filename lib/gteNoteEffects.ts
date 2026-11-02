import type { EditorSnapshot, Note, TabCoord } from "../types/gte";
import { getMaxFretFromSnapshot, getOpenStringMidiFromSnapshot, getTabMidi } from "./gteTuning";

type EffectNote = EditorSnapshot["notes"][number];

export type NoteFingeringUpdate = { noteId: number; tab: TabCoord };

export type AlignEffectNotesResult =
  | {
      ok: true;
      noteIds: number[];
      targetString: number;
      changedNoteIds: number[];
    }
  | {
      ok: false;
      noteIds: number[];
      targetString: number | null;
      failedNoteId: number | null;
    };

const getNoteMidi = (snapshot: EditorSnapshot, note: EffectNote) => {
  if (Number.isFinite(note.midiNum) && note.midiNum > 0) return note.midiNum;
  return getTabMidi(snapshot, note.tab, 0);
};

export const orderNotesForEffect = (snapshot: EditorSnapshot, noteIds: number[]): EffectNote[] => {
  const uniqueIds = new Set(noteIds);
  return snapshot.notes
    .filter((note) => uniqueIds.has(note.id))
    .sort((left, right) => left.startTime - right.startTime || left.id - right.id);
};

const findEquivalentTabOnString = (
  snapshot: EditorSnapshot,
  targetString: number,
  midi: number
): TabCoord | null => {
  const openMidi = getOpenStringMidiFromSnapshot(snapshot)[targetString];
  const fret = midi - openMidi;
  const maxFret = getMaxFretFromSnapshot(snapshot);
  return Number.isInteger(fret) && fret >= 0 && fret <= maxFret
    ? [targetString, fret]
    : null;
};

const getEffectConnectedNoteIds = (snapshot: EditorSnapshot, anchorNoteId: number) => {
  const connected = new Set<number>([anchorNoteId]);
  const pending = [anchorNoteId];
  while (pending.length) {
    const current = pending.pop()!;
    (snapshot.noteEffects ?? []).forEach((effect) => {
      let neighbour: number | null = null;
      if (effect.startNoteId === current) neighbour = effect.endNoteId;
      if (effect.endNoteId === current) neighbour = effect.startNoteId;
      if (neighbour === null || connected.has(neighbour)) return;
      connected.add(neighbour);
      pending.push(neighbour);
    });
  }
  return connected;
};

/** Applies exact fingering updates without traversing effect connections. */
export const applyNoteFingeringUpdates = (
  snapshot: EditorSnapshot,
  updates: NoteFingeringUpdate[]
) => {
  updates.forEach((update) => {
    const note = snapshot.notes.find((item) => item.id === update.noteId);
    if (!note) return;
    note.tab = [update.tab[0], update.tab[1]];
    note.midiNum = getTabMidi(snapshot, update.tab, note.midiNum);
  });
};

/**
 * Plans the complete fingering change for one or more user edits. Notes connected
 * by effects follow the first edited note in their component onto its string,
 * while retaining their own pitch. Notes unavailable on that string stay put.
 */
export const getEffectAwareFingeringUpdates = (
  snapshot: EditorSnapshot,
  requestedUpdates: NoteFingeringUpdate[]
): NoteFingeringUpdate[] => {
  const draft: EditorSnapshot = {
    ...snapshot,
    notes: snapshot.notes.map((note) => ({
      ...note,
      tab: [note.tab[0], note.tab[1]],
      optimals: note.optimals.map((tab) => [tab[0], tab[1]] as TabCoord),
    })),
  };
  const validRequests = requestedUpdates.filter((update) =>
    draft.notes.some((note) => note.id === update.noteId)
  );

  // Explicit edits establish the pitches the user requested before linked notes
  // are re-fingered onto a shared string.
  validRequests.forEach((update) => {
    const note = draft.notes.find((item) => item.id === update.noteId)!;
    note.tab = [update.tab[0], update.tab[1]];
    note.midiNum = getTabMidi(draft, update.tab, note.midiNum);
  });

  const handledNoteIds = new Set<number>();
  validRequests.forEach((request) => {
    if (handledNoteIds.has(request.noteId)) return;
    const connectedIds = getEffectConnectedNoteIds(draft, request.noteId);
    connectedIds.forEach((id) => handledNoteIds.add(id));
    if (connectedIds.size < 2) return;

    const targetString = request.tab[0];
    connectedIds.forEach((noteId) => {
      if (noteId === request.noteId) return;
      const note = draft.notes.find((item) => item.id === noteId);
      if (!note) return;
      const midi = getNoteMidi(draft, note);
      const equivalentTab = findEquivalentTabOnString(draft, targetString, midi);
      if (!equivalentTab) return;
      note.tab = equivalentTab;
      note.midiNum = midi;
    });
  });

  return draft.notes.flatMap((note) => {
    const original = snapshot.notes.find((item) => item.id === note.id);
    if (!original || (original.tab[0] === note.tab[0] && original.tab[1] === note.tab[1])) return [];
    return [{ noteId: note.id, tab: [note.tab[0], note.tab[1]] as TabCoord }];
  });
};

/**
 * Prefers the earliest note's string, then tries other common playable strings.
 * Commits all fingerings together only after every pitch can be preserved.
 */
export const alignEffectNotesToFirstString = (
  snapshot: EditorSnapshot,
  noteIds: number[]
): AlignEffectNotesResult => {
  const notes = orderNotesForEffect(snapshot, noteIds);
  const orderedNoteIds = notes.map((note) => note.id);
  if (notes.length < 2) {
    return {
      ok: false,
      noteIds: orderedNoteIds,
      targetString: notes[0]?.tab[0] ?? null,
      failedNoteId: null,
    };
  }

  const firstString = notes[0].tab[0];
  const pitches = notes.map(note => getNoteMidi(snapshot, note));
  const candidates = getOpenStringMidiFromSnapshot(snapshot).flatMap((_, string) => {
    const tabs = pitches.map(midi => findEquivalentTabOnString(snapshot, string, midi));
    if (tabs.some(tab => tab === null)) return [];
    const playable = tabs as TabCoord[];
    return [{string, tabs: playable,
      moved: notes.filter(note => note.tab[0] !== string).length,
      distance: notes.reduce((sum, note) => sum + Math.abs(note.tab[0] - string), 0),
    }];
  }).sort((a, b) => Number(b.string === firstString) - Number(a.string === firstString)
    || a.moved - b.moved || a.distance - b.distance
    || Math.abs(a.string - firstString) - Math.abs(b.string - firstString) || a.string - b.string);
  const best = candidates[0];
  if (!best) return {
    ok: false, noteIds: orderedNoteIds, targetString: null,
    failedNoteId: notes.find((_, index) => !findEquivalentTabOnString(snapshot, firstString, pitches[index]))?.id ?? null,
  };
  const targetString = best.string;

  const changedNoteIds: number[] = [];
  notes.forEach((note, index) => {
    const tab = best.tabs[index];
    if (note.tab[0] !== tab[0] || note.tab[1] !== tab[1]) {
      changedNoteIds.push(note.id);
    }
    note.tab = [tab[0], tab[1]];
    note.midiNum = pitches[index];
  });

  return { ok: true, noteIds: orderedNoteIds, targetString, changedNoteIds };
};

export const getEffectPairKeys = (notes: Pick<Note, "id">[]) =>
  notes.slice(0, -1).map((note, index) => {
    const next = notes[index + 1];
    return `${Math.min(note.id, next.id)}:${Math.max(note.id, next.id)}`;
  });
