export type TabCoord = [number, number];

export type Note = {
  id: number;
  startTime: number;
  length: number;
  midiNum: number;
  tab: TabCoord;
  optimals: TabCoord[];
};

export type GteTrackType = "tab" | "chords" | "drums";

export type TimingAnchor = {
  tick: number;
  seconds: number;
};

export type TimingBar = {
  id: string;
  index: number;
  startFrame: number;
  endFrame: number;
  startSeconds: number;
  endSeconds: number;
  quarterNoteBpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  anchors: TimingAnchor[];
  confidence: number;
  source: "audio" | "onset_consensus" | "manual" | "legacy" | "fallback" | string;
};

export type TimingMapV2 = {
  version: 2;
  framesPerBar: 480;
  audioOffsetSeconds: number;
  bars: TimingBar[];
};

export type DrumLoopRegion = {
  id: string;
  sourceStart: number;
  sourceEnd: number;
  loopEnd: number;
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
  fingers?: Array<number | null>;
  barreFrets?: number[];
  noteNames?: string[];
  midiNotes?: number[];
  tabs?: TabCoord[];
};

export type CutRegion = [number, number];

export type CutWithCoord = [CutRegion, TabCoord];

export type EditorSnapshot = {
  id: string;
  name?: string;
  editorType?: GteTrackType | string;
  type?: GteTrackType | string;
  trackType?: GteTrackType | string;
  chordEditor?: Record<string, unknown>;
  instrumentId?: string;
  playbackVolume?: number;
  playbackMuted?: boolean;
  playbackIsolated?: boolean;
  timelineOffsetFrames?: number;
  importGroupId?: string;
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
  drumLoops?: DrumLoopRegion[];
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
  timingVersion?: number;
  timingMap?: TimingMapV2;
  editors: EditorSnapshot[];
};
