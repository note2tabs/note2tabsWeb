export type Note = {
  id: number;
  startTime: number;
  length: number;
  midiNum: number;
  tab: [number, number];
  optimals: [number, number][];
};

export type Chord = {
  id: number;
  startTime: number;
  length: number;
  originalMidi: number[];
  currentTabs: [number, number][];
  ogTabs: [number, number][];
};

export type EditorSnapshot = {
  id: string;
  schemaVersion: number;
  version: number;
  framesPerMessure: number;
  fps: number;
  notes: Note[];
  chords: Chord[];
  cutPositionsWithCoords: [[[number, number], [number, number]]];
  optimalsByTime: Record<string, Record<string, [number, number][]>>;
  tabRef: number[][];
};

export type NoteOptimalsResponse = {
  possibleTabs: [number, number][];
  blockedTabs: [number, number][];
};

export type ChordAlternativesResponse = {
  alternatives: [number, number][][];
};

export type SnapshotResponse = {
  ok: true;
  snapshot: EditorSnapshot;
};
