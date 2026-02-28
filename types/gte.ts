export type TabCoord = [number, number];

export type Note = {
  id: number;
  startTime: number;
  length: number;
  midiNum: number;
  tab: TabCoord;
  optimals: TabCoord[];
};

export type Chord = {
  id: number;
  startTime: number;
  length: number;
  originalMidi: number[];
  currentTabs: TabCoord[];
  ogTabs: TabCoord[];
};

export type CutRegion = [number, number];

export type CutWithCoord = [CutRegion, TabCoord];

export type EditorSnapshot = {
  id: string;
  name?: string;
  schemaVersion?: number;
  version?: number;
  updatedAt?: string;
  timeSignature?: number;
  framesPerMessure: number;
  fps: number;
  totalFrames: number;
  secondsPerBar?: number;
  notes: Note[];
  chords: Chord[];
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
  secondsPerBar?: number;
  editors: EditorSnapshot[];
};
