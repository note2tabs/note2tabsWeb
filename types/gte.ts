export type TabCoord = [number, number];
export const NOTE_EFFECT_NONE = 0;
export const NOTE_EFFECT_MAX = 4;

export type Note = {
  id: number;
  startTime: number;
  length: number;
  midiNum: number;
  tab: TabCoord;
  optimals: TabCoord[];
  //end effects "none" "b1" "b2" "b3" "p" 0,1,2,3,4 (b1 is bend 1 semi-tone)
  //start effects "none" "b1" "b2" "b3" "h" 0, 1, 2, 3, 4 (same but bend here is pre bend)
  endEffect: number;
  startEffect: number;
  preBendSustain: number;//length of the part where you hold the bend
  preBendTransition: number;
  bendSustain: number;
  bendTransition: number;
};

const clampNoteEffectValue = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NOTE_EFFECT_NONE;
  return Math.max(NOTE_EFFECT_NONE, Math.min(NOTE_EFFECT_MAX, Math.round(parsed)));
};

const clampNoteTimingValue = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

export const applyDefaultNoteEffects = <
  T extends Record<string, unknown> & {
    endEffect?: unknown;
    startEffect?: unknown;
    preBendSustain?: unknown;
    preBendTransition?: unknown;
    bendSustain?: unknown;
    bendTransition?: unknown;
  },
>(
  note: T
): T &
  Pick<
    Note,
    | "endEffect"
    | "startEffect"
    | "preBendSustain"
    | "preBendTransition"
    | "bendSustain"
    | "bendTransition"
  > => ({
  ...note,
  endEffect: clampNoteEffectValue(note.endEffect),
  startEffect: clampNoteEffectValue(note.startEffect),
  preBendSustain: clampNoteTimingValue(note.preBendSustain),
  preBendTransition: clampNoteTimingValue(note.preBendTransition),
  bendSustain: clampNoteTimingValue(note.bendSustain),
  bendTransition: clampNoteTimingValue(note.bendTransition),
});

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
