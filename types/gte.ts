export type TabCoord = [number, number];

export type Note = {
  id: number;
  startTime: number;
  length: number;
  midiNum: number;
  tab: TabCoord;
  optimals: TabCoord[];
};

export type NoteEffect = {
  id: number;
  type: number;
  startNoteId: number;
  endNoteId: number;
  noteEffectLabel: string;
};

export type Chord = {
  id: number;
  startTime: number;
  length: number;
  originalMidi: number[];
  currentTabs: TabCoord[];
  ogTabs: TabCoord[];
  fingering?: ChordFingering;
  fingeringIndex?: number;
  root?: string;
  quality?: string;
  extension?: string;
  label?: string;
  strums?: Array<{
    id?: number;
    time: number;
    direction: "down" | "up" | "mute";
  }>;
};

export type ChordFingering = {
  root: string;
  type: string;
  positions: Array<number | null>;
  noteNames?: string[];
  midiNotes?: number[];
  tabs?: TabCoord[];
};

export type CutRegion = [number, number];

export type CutWithCoord = [CutRegion, TabCoord];

export type EditorSnapshot = {
  id: string;
  name?: string;
  editorType?: "tab" | "chords" | string;
  type?: "tab" | "chords" | string;
  trackType?: "tab" | "chords" | string;
  chordEditor?: Record<string, unknown>;
  instrumentId?: string;
  tuning?: {
    presetId?: string;
    label?: string;
    openStringMidi: number[];
    capo?: number;
  };
  schemaVersion?: number;
  version?: number;
  updatedAt?: string;
  timeSignature?: number;
  timeSignatureBottom?: number;
  framesPerMessure: number;
  fps: number;
  totalFrames: number;
  secondsPerBar?: number;
  notes: Note[];
  chords: Chord[];
  noteEffects?: NoteEffect[];
  cutPositionsWithCoords: CutWithCoord[];
  optimalsByTime: Record<string, Record<string, TabCoord[]>>;
  tabRef?: number[][];
};

export type EditorListItem = {
  id: string;
  name?: string;
  updatedAt?: string;
  version?: number;
  framesPerMessure?: number;
  totalFrames?: number;
  noteCount?: number;
  chordCount?: number;
};

export type CanvasSnapshot = {
  id: string;
  name?: string;
  schemaVersion?: number;
  canvasSchemaVersion?: number;
  version?: number;
  updatedAt?: string;
  keyBase?: number;
  keyType?: number;
  secondsPerBar?: number;
  editors: EditorSnapshot[];
};
