import type { Chord, CutWithCoord, EditorSnapshot, Note, TabCoord } from "../types/gte";

export const GTE_FRAMES_PER_BAR = 480;

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const cloneEditorSnapshot = (snapshot: EditorSnapshot): EditorSnapshot =>
  JSON.parse(JSON.stringify(snapshot)) as EditorSnapshot;

export const nextLocalNoteId = (snapshot: EditorSnapshot, currentNextId = 1) =>
  Math.max(
    currentNextId,
    snapshot.notes.reduce((max, note) => Math.max(max, Math.round(toNumber(note.id, 0))), 0) + 1,
    1
  );

export const nextLocalChordId = (snapshot: EditorSnapshot, currentNextId = 1) =>
  Math.max(
    currentNextId,
    snapshot.chords.reduce((max, chord) => Math.max(max, Math.round(toNumber(chord.id, 0))), 0) + 1,
    1
  );

const normalizeTab = (tab: TabCoord): TabCoord => [
  Math.max(0, Math.min(5, Math.round(toNumber(tab[0], 0)))),
  Math.max(0, Math.round(toNumber(tab[1], 0))),
];

const normalizeCutCoord = (tab: TabCoord): TabCoord => [
  Math.max(0, Math.min(5, Math.round(toNumber(tab[0], 2)))),
  Math.max(0, Math.round(toNumber(tab[1], 0))),
];

const sortNotes = (notes: Note[]) =>
  [...notes].sort((left, right) => left.startTime - right.startTime || left.id - right.id);

const sortChords = (chords: Chord[]) =>
  [...chords].sort((left, right) => left.startTime - right.startTime || left.id - right.id);

export const addNoteLocal = (
  snapshot: EditorSnapshot,
  note: Omit<Note, "id" | "optimals"> & Partial<Pick<Note, "id" | "optimals">>
) => {
  const next = cloneEditorSnapshot(snapshot);
  const id = note.id ?? nextLocalNoteId(next);
  next.notes = sortNotes([
    ...next.notes,
    {
      id,
      startTime: Math.max(0, Math.round(toNumber(note.startTime, 0))),
      length: Math.max(1, Math.round(toNumber(note.length, 1))),
      midiNum: Math.round(toNumber(note.midiNum, 0)),
      tab: normalizeTab(note.tab),
      optimals: Array.isArray(note.optimals) ? note.optimals.map(normalizeTab) : [],
    },
  ]);
  next.totalFrames = Math.max(next.totalFrames, next.notes[next.notes.length - 1]?.startTime ?? 0);
  return next;
};

export const deleteNoteLocal = (snapshot: EditorSnapshot, noteId: number) => {
  const next = cloneEditorSnapshot(snapshot);
  next.notes = next.notes.filter((note) => note.id !== noteId);
  return next;
};

export const moveNoteLocal = (snapshot: EditorSnapshot, noteId: number, startTime: number) => {
  const next = cloneEditorSnapshot(snapshot);
  const note = next.notes.find((item) => item.id === noteId);
  if (note) note.startTime = Math.max(0, Math.round(toNumber(startTime, note.startTime)));
  next.notes = sortNotes(next.notes);
  return next;
};

export const resizeNoteLocal = (snapshot: EditorSnapshot, noteId: number, length: number) => {
  const next = cloneEditorSnapshot(snapshot);
  const note = next.notes.find((item) => item.id === noteId);
  if (note) note.length = Math.max(1, Math.round(toNumber(length, note.length)));
  return next;
};

export const assignNoteTabLocal = (snapshot: EditorSnapshot, noteId: number, tab: TabCoord) => {
  const next = cloneEditorSnapshot(snapshot);
  const note = next.notes.find((item) => item.id === noteId);
  if (note) note.tab = normalizeTab(tab);
  return next;
};

export const setChordTabsLocal = (snapshot: EditorSnapshot, chordId: number, tabs: TabCoord[]) => {
  const next = cloneEditorSnapshot(snapshot);
  const chord = next.chords.find((item) => item.id === chordId);
  if (chord) chord.currentTabs = tabs.map(normalizeTab);
  return next;
};

export const moveChordLocal = (snapshot: EditorSnapshot, chordId: number, startTime: number) => {
  const next = cloneEditorSnapshot(snapshot);
  const chord = next.chords.find((item) => item.id === chordId);
  if (chord) chord.startTime = Math.max(0, Math.round(toNumber(startTime, chord.startTime)));
  next.chords = sortChords(next.chords);
  return next;
};

export const resizeChordLocal = (snapshot: EditorSnapshot, chordId: number, length: number) => {
  const next = cloneEditorSnapshot(snapshot);
  const chord = next.chords.find((item) => item.id === chordId);
  if (chord) chord.length = Math.max(1, Math.round(toNumber(length, chord.length)));
  return next;
};

export const makeChordLocal = (snapshot: EditorSnapshot, noteIds: number[]) => {
  const next = cloneEditorSnapshot(snapshot);
  const selected = next.notes.filter((note) => noteIds.includes(note.id));
  if (selected.length < 2) return next;
  const startTime = Math.min(...selected.map((note) => note.startTime));
  const length = Math.max(1, Math.max(...selected.map((note) => note.length)));
  const chord: Chord = {
    id: nextLocalChordId(next),
    startTime,
    length,
    originalMidi: selected.map((note) => note.midiNum),
    currentTabs: selected.map((note) => normalizeTab(note.tab)),
    ogTabs: selected.map((note) => normalizeTab(note.tab)),
  };
  next.notes = next.notes.filter((note) => !noteIds.includes(note.id));
  next.chords = sortChords([...next.chords, chord]);
  return next;
};

export const disbandChordLocal = (snapshot: EditorSnapshot, chordId: number) => {
  const next = cloneEditorSnapshot(snapshot);
  const chord = next.chords.find((item) => item.id === chordId);
  if (!chord) return next;
  let noteId = nextLocalNoteId(next);
  const notes = chord.currentTabs.map((tab, index): Note => ({
    id: noteId++,
    startTime: chord.startTime,
    length: chord.length,
    midiNum: chord.originalMidi[index] ?? 0,
    tab: normalizeTab(tab),
    optimals: [],
  }));
  next.chords = next.chords.filter((item) => item.id !== chordId);
  next.notes = sortNotes([...next.notes, ...notes]);
  return next;
};

const normalizeCuts = (cuts: CutWithCoord[], totalFrames: number): CutWithCoord[] => {
  const normalized = cuts
    .map((cut): CutWithCoord => {
      const start = Math.max(0, Math.min(totalFrames - 1, Math.round(toNumber(cut[0][0], 0))));
      const end = Math.max(start + 1, Math.min(totalFrames, Math.round(toNumber(cut[0][1], totalFrames))));
      return [[start, end], normalizeCutCoord(cut[1])];
    })
    .sort((left, right) => left[0][0] - right[0][0]);
  return normalized.length ? normalized : [[[0, totalFrames], [2, 0]]];
};

export const insertCutBoundaryLocal = (snapshot: EditorSnapshot, time: number, coord: TabCoord) => {
  const next = cloneEditorSnapshot(snapshot);
  const totalFrames = Math.max(1, Math.round(toNumber(next.totalFrames, GTE_FRAMES_PER_BAR)));
  const boundary = Math.max(1, Math.min(totalFrames - 1, Math.round(toNumber(time, 0))));
  const cuts: CutWithCoord[] = [];
  normalizeCuts(next.cutPositionsWithCoords, totalFrames).forEach((cut) => {
    if (boundary > cut[0][0] && boundary < cut[0][1]) {
      cuts.push([[cut[0][0], boundary], cut[1]]);
      cuts.push([[boundary, cut[0][1]], normalizeCutCoord(coord)]);
      return;
    }
    cuts.push(cut);
  });
  next.cutPositionsWithCoords = normalizeCuts(cuts, totalFrames);
  return next;
};

export const shiftCutBoundaryLocal = (snapshot: EditorSnapshot, boundaryIndex: number, time: number) => {
  const next = cloneEditorSnapshot(snapshot);
  const totalFrames = Math.max(1, Math.round(toNumber(next.totalFrames, GTE_FRAMES_PER_BAR)));
  const cuts = normalizeCuts(next.cutPositionsWithCoords, totalFrames);
  const index = Math.max(1, Math.min(cuts.length - 1, Math.round(toNumber(boundaryIndex, 1))));
  if (!cuts[index]) return next;
  const min = cuts[index - 1][0][0] + 1;
  const max = cuts[index][0][1] - 1;
  const boundary = Math.max(min, Math.min(max, Math.round(toNumber(time, cuts[index][0][0]))));
  cuts[index - 1][0][1] = boundary;
  cuts[index][0][0] = boundary;
  next.cutPositionsWithCoords = normalizeCuts(cuts, totalFrames);
  return next;
};

export const deleteCutBoundaryLocal = (snapshot: EditorSnapshot, boundaryIndex: number) => {
  const next = cloneEditorSnapshot(snapshot);
  const totalFrames = Math.max(1, Math.round(toNumber(next.totalFrames, GTE_FRAMES_PER_BAR)));
  const cuts = normalizeCuts(next.cutPositionsWithCoords, totalFrames);
  const index = Math.round(toNumber(boundaryIndex, 0));
  if (index <= 0 || index >= cuts.length) return next;
  cuts[index - 1][0][1] = cuts[index][0][1];
  cuts.splice(index, 1);
  next.cutPositionsWithCoords = normalizeCuts(cuts, totalFrames);
  return next;
};

export const addBarLocal = (snapshot: EditorSnapshot) => {
  const next = cloneEditorSnapshot(snapshot);
  next.totalFrames = Math.max(GTE_FRAMES_PER_BAR, Math.round(toNumber(next.totalFrames, 0))) + GTE_FRAMES_PER_BAR;
  next.cutPositionsWithCoords = normalizeCuts(next.cutPositionsWithCoords, next.totalFrames);
  return next;
};

export const removeBarLocal = (snapshot: EditorSnapshot, barIndex: number) => {
  const next = cloneEditorSnapshot(snapshot);
  const totalBars = Math.max(1, Math.ceil(toNumber(next.totalFrames, GTE_FRAMES_PER_BAR) / GTE_FRAMES_PER_BAR));
  if (totalBars <= 1) return next;
  const safeIndex = Math.max(0, Math.min(totalBars - 1, Math.round(toNumber(barIndex, 0))));
  const start = safeIndex * GTE_FRAMES_PER_BAR;
  const end = start + GTE_FRAMES_PER_BAR;
  const shift = (time: number) => (time >= end ? time - GTE_FRAMES_PER_BAR : time);
  next.notes = sortNotes(next.notes.filter((note) => note.startTime < start || note.startTime >= end).map((note) => ({
    ...note,
    startTime: shift(note.startTime),
  })));
  next.chords = sortChords(next.chords.filter((chord) => chord.startTime < start || chord.startTime >= end).map((chord) => ({
    ...chord,
    startTime: shift(chord.startTime),
  })));
  next.totalFrames = Math.max(GTE_FRAMES_PER_BAR, next.totalFrames - GTE_FRAMES_PER_BAR);
  next.cutPositionsWithCoords = normalizeCuts(
    next.cutPositionsWithCoords.map((cut): CutWithCoord => [[shift(cut[0][0]), shift(cut[0][1])], cut[1]]),
    next.totalFrames
  );
  return next;
};
