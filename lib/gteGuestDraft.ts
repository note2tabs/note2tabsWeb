import type { CutWithCoord, EditorSnapshot, TabCoord } from "../types/gte";
import { hydrateChordFingering } from "./gteChordFingerings";
import {
  DEFAULT_TRACK_INSTRUMENT_ID,
  normalizeTrackInstrumentId,
} from "./gteInstrumentManifest";
import { normalizeDrumLoops } from "./gteDrumLoops";
import { getTuningPreset, normalizeCapo } from "./gteTuning";
import { normalizeGteTrackType } from "./gteTrackTypes";

export const GTE_GUEST_EDITOR_ID = "local";
export const GTE_GUEST_DRAFT_STORAGE_KEY = "note2tabs:gte:guest-draft:v1";

const FIXED_FRAMES_PER_BAR = 480;
const DEFAULT_SECONDS_PER_BAR = 2;
const DEFAULT_FPS = Math.round(FIXED_FRAMES_PER_BAR / DEFAULT_SECONDS_PER_BAR);
const DEFAULT_TOTAL_FRAMES = FIXED_FRAMES_PER_BAR * 2;
const DEFAULT_TIME_SIGNATURE = 4;
const DEFAULT_MAX_FRET = 22;
const DEFAULT_CUT_COORD: TabCoord = [2, 0];
const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40];

type GuestDraftRecord = {
  version: 1;
  savedAt: string;
  snapshot: EditorSnapshot;
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Math.round(toFiniteNumber(value, fallback));
  return Math.max(min, Math.min(max, parsed));
};

const fpsFromSecondsPerBar = (secondsPerBar: number) => {
  const safeSeconds = Math.max(0.1, secondsPerBar);
  return Math.max(1, Math.round(FIXED_FRAMES_PER_BAR / safeSeconds));
};

const inferSecondsPerBar = (raw: Record<string, unknown>, fallback: number) => {
  const fromSeconds = toFiniteNumber(raw.secondsPerBar, NaN);
  if (Number.isFinite(fromSeconds) && fromSeconds > 0) {
    return Math.max(0.1, fromSeconds);
  }
  const rawFrames = toFiniteNumber(raw.framesPerMessure, NaN);
  const rawFps = toFiniteNumber(raw.fps, NaN);
  if (Number.isFinite(rawFps) && rawFps > 0) {
    if (Number.isFinite(rawFrames) && rawFrames > 0) {
      return Math.max(0.1, rawFrames / rawFps);
    }
    return Math.max(0.1, FIXED_FRAMES_PER_BAR / rawFps);
  }
  return Math.max(0.1, fallback);
};

const scaleFrame = (value: unknown, ratio: number, minimum: number) => {
  const base = Math.max(0, clampInt(value, 0, 0, 100000000));
  return Math.max(minimum, Math.round(base * ratio));
};

const normalizeOptimalsByTime = (
  value: unknown,
  ratio: number
): Record<string, Record<string, TabCoord[]>> => {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, Record<string, TabCoord[]>>;
  if (Math.abs(ratio - 1) < 0.000001) {
    return source;
  }
  const next: Record<string, Record<string, TabCoord[]>> = {};
  Object.entries(source).forEach(([key, coordsByMidi]) => {
    const parsedKey = Number(key);
    const normalizedKey = Number.isFinite(parsedKey)
      ? String(Math.max(0, Math.round(parsedKey * ratio)))
      : key;
    const existing = next[normalizedKey] && typeof next[normalizedKey] === "object" ? next[normalizedKey] : {};
    const incoming = coordsByMidi && typeof coordsByMidi === "object" ? coordsByMidi : {};
    next[normalizedKey] = { ...existing, ...incoming };
  });
  return next;
};

const buildDefaultCutPositions = (totalFrames: number = DEFAULT_TOTAL_FRAMES): CutWithCoord[] => [
  [
    [
      0,
      Math.max(
        FIXED_FRAMES_PER_BAR,
        clampInt(totalFrames, DEFAULT_TOTAL_FRAMES, FIXED_FRAMES_PER_BAR, 100000000)
      ),
    ],
    [DEFAULT_CUT_COORD[0], DEFAULT_CUT_COORD[1]],
  ],
];

const normalizeTuning = (value: unknown, legacyTabRef: unknown): EditorSnapshot["tuning"] => {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const preset = getTuningPreset(typeof raw.presetId === "string" ? raw.presetId : undefined);
  const fromRaw = Array.isArray(raw.openStringMidi)
    ? raw.openStringMidi.map((item) => toFiniteNumber(item, NaN)).filter((item) => Number.isFinite(item))
    : [];
  const legacyOpenStrings = Array.isArray(legacyTabRef)
    ? legacyTabRef.slice(0, 6).map((stringValues) =>
        Array.isArray(stringValues) ? toFiniteNumber(stringValues[0], NaN) : NaN
      )
    : [];
  const openStringMidi = fromRaw.length >= 1 && fromRaw.length <= 12
    ? fromRaw.map((item) => Math.round(item))
    : legacyOpenStrings.length === 6 && legacyOpenStrings.every(Number.isFinite)
      ? legacyOpenStrings.map((item) => Math.round(item))
      : [...preset.openStringMidi];
  return {
    presetId: preset.id,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : preset.label,
    openStringMidi,
    capo: normalizeCapo(raw.capo),
  };
};

const normalizeTab = (value: unknown): TabCoord | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const stringIndex = clampInt(value[0], 0, 0, 11);
  const fret = clampInt(value[1], 0, 0, DEFAULT_MAX_FRET);
  return [stringIndex, fret];
};

const normalizeCutPositions = (value: unknown, ratio: number): CutWithCoord[] => {
  if (!Array.isArray(value)) return [];
  const result: CutWithCoord[] = [];
  value.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return;
    const region = Array.isArray(entry[0]) ? entry[0] : [];
    const coord = normalizeTab(entry[1]);
    if (!coord || region.length < 2) return;
    const start = scaleFrame(region[0], ratio, 0);
    const end = Math.max(start + 1, scaleFrame(region[1], ratio, start + 1));
    result.push([[start, end], coord]);
  });
  return result;
};

const normalizeNoteEffects = (value: unknown): NonNullable<EditorSnapshot["noteEffects"]> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const effect = entry as Record<string, unknown>;
      const type = clampInt(effect.type, -1, -1, 2);
      const startNoteId = clampInt(effect.startNoteId, -1, -2147483648, 2147483647);
      const endNoteId = clampInt(effect.endNoteId, -1, -2147483648, 2147483647);
      if (type < 0 || startNoteId < 0 || endNoteId < 0 || startNoteId === endNoteId) return null;
      return {
        id: clampInt(effect.id, 0, -2147483648, 2147483647),
        type,
        startNoteId,
        endNoteId,
        noteEffectLabel:
          typeof effect.noteEffectLabel === "string" ? effect.noteEffectLabel : String(effect.noteEffectLabel ?? ""),
      };
    })
    .filter((effect): effect is NonNullable<EditorSnapshot["noteEffects"]>[number] => effect !== null);
};

const normalizeEditorType = (value: unknown) => {
  return normalizeGteTrackType(value);
};

const normalizeChordEditor = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : undefined;

const normalizeChordStrums = (value: unknown): NonNullable<EditorSnapshot["chords"][number]["strums"]> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index): NonNullable<EditorSnapshot["chords"][number]["strums"]>[number] | null => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const direction: "down" | "up" | "mute" =
        raw.direction === "up" ? "up" : raw.direction === "mute" || raw.direction === "x" ? "mute" : "down";
      return {
        id: clampInt(raw.id, index + 1, -2147483648, 2147483647),
        time: clampInt(raw.time, 0, 0, 100000000),
        direction,
      };
    })
    .filter((entry): entry is NonNullable<EditorSnapshot["chords"][number]["strums"]>[number] => entry !== null);
};

export const createGuestSnapshot = (editorId: string = GTE_GUEST_EDITOR_ID): EditorSnapshot => {
  return {
    id: editorId,
    name: "Untitled",
    editorType: "guitar",
    type: "guitar",
    trackType: "guitar",
    instrumentId: DEFAULT_TRACK_INSTRUMENT_ID,
    schemaVersion: 1,
    version: 1,
    updatedAt: new Date().toISOString(),
    timeSignature: DEFAULT_TIME_SIGNATURE,
    timeSignatureBottom: 4,
    framesPerMessure: FIXED_FRAMES_PER_BAR,
    fps: DEFAULT_FPS,
    totalFrames: DEFAULT_TOTAL_FRAMES,
    secondsPerBar: DEFAULT_SECONDS_PER_BAR,
    notes: [],
    chords: [],
    noteEffects: [],
    drumLoops: [],
    cutPositionsWithCoords: buildDefaultCutPositions(DEFAULT_TOTAL_FRAMES),
    optimalsByTime: {},
    maxFret: DEFAULT_MAX_FRET,
  };
};

export const normalizeGuestSnapshot = (
  rawSnapshot: unknown,
  fallbackEditorId: string = GTE_GUEST_EDITOR_ID
): EditorSnapshot => {
  const base = createGuestSnapshot(fallbackEditorId);
  const raw = rawSnapshot && typeof rawSnapshot === "object" ? (rawSnapshot as Record<string, unknown>) : {};

  const sourceFramesPerBar = Math.max(1, clampInt(raw.framesPerMessure, base.framesPerMessure, 1, 100000));
  const frameRatio = FIXED_FRAMES_PER_BAR / sourceFramesPerBar;
  const secondsPerBar = inferSecondsPerBar(raw, base.secondsPerBar || DEFAULT_SECONDS_PER_BAR);
  const fps = fpsFromSecondsPerBar(secondsPerBar);
  const totalFrames = Math.max(
    FIXED_FRAMES_PER_BAR,
    scaleFrame(
      clampInt(raw.totalFrames, base.totalFrames, sourceFramesPerBar, 100000000),
      frameRatio,
      FIXED_FRAMES_PER_BAR
    )
  );
  const timeSignature = clampInt(raw.timeSignature, base.timeSignature || DEFAULT_TIME_SIGNATURE, 1, 64);
  const timeSignatureBottom = clampInt(raw.timeSignatureBottom, base.timeSignatureBottom || 4, 1, 64);

  const notes = Array.isArray(raw.notes)
    ? raw.notes
        .map((value) => {
          if (!value || typeof value !== "object") return null;
          const note = value as Record<string, unknown>;
          const tab = normalizeTab(note.tab);
          if (!tab) return null;
          return {
            id: clampInt(note.id, 0, -2147483648, 2147483647),
            startTime: scaleFrame(note.startTime, frameRatio, 0),
            length: scaleFrame(note.length, frameRatio, 1),
            midiNum: clampInt(note.midiNum, 0, -2147483648, 2147483647),
            tab,
            optimals: Array.isArray(note.optimals)
              ? note.optimals.map((item) => normalizeTab(item)).filter((item): item is TabCoord => Boolean(item))
              : [],
          };
        })
        .filter((note): note is EditorSnapshot["notes"][number] => note !== null)
    : [];

  const chords = Array.isArray(raw.chords)
    ? raw.chords
        .map((value) => {
          if (!value || typeof value !== "object") return null;
          const chord = value as Record<string, unknown>;
          const currentTabs = Array.isArray(chord.currentTabs)
            ? chord.currentTabs
                .map((item) => normalizeTab(item))
                .filter((item): item is TabCoord => Boolean(item))
            : [];
          const root = typeof chord.root === "string" && chord.root.trim() ? chord.root.trim() : undefined;
          const quality = typeof chord.quality === "string" && chord.quality.trim() ? chord.quality.trim() : undefined;
          const extension =
            typeof chord.extension === "string" && chord.extension.trim() ? chord.extension.trim() : undefined;
          const label = typeof chord.label === "string" && chord.label.trim() ? chord.label.trim() : undefined;
          const fingering =
            chord.fingering && typeof chord.fingering === "object" && !Array.isArray(chord.fingering)
              ? hydrateChordFingering(chord.fingering as any)
              : undefined;
          if (!currentTabs.length && !root && !quality && !label) return null;
          const ogTabs = Array.isArray(chord.ogTabs)
            ? chord.ogTabs
                .map((item) => normalizeTab(item))
                .filter((item): item is TabCoord => Boolean(item))
            : currentTabs.map((tab) => [tab[0], tab[1]] as TabCoord);
          const originalMidi = Array.isArray(chord.originalMidi)
            ? chord.originalMidi.map((item) => clampInt(item, 0, -2147483648, 2147483647))
            : [];
          return {
            id: clampInt(chord.id, 0, -2147483648, 2147483647),
            startTime: scaleFrame(chord.startTime, frameRatio, 0),
            length: scaleFrame(chord.length, frameRatio, 1),
            originalMidi,
            currentTabs,
            ogTabs,
            ...(root ? { root } : {}),
            ...(quality ? { quality } : {}),
            ...(extension ? { extension } : {}),
            ...(label ? { label } : {}),
            ...(fingering ? { fingering } : {}),
            ...(Number.isFinite(Number(chord.fingeringIndex))
              ? { fingeringIndex: clampInt(chord.fingeringIndex, 0, 0, 1000000) }
              : {}),
            strums: normalizeChordStrums(chord.strums),
          };
        })
        .filter((chord): chord is NonNullable<typeof chord> => chord !== null)
    : [];

  const noteEffects = normalizeNoteEffects(raw.noteEffects);
  const drumLoops = normalizeDrumLoops(
    Array.isArray(raw.drumLoops)
      ? raw.drumLoops.map((entry) => {
          if (!entry || typeof entry !== "object") return entry;
          const loop = entry as Record<string, unknown>;
          return {
            ...loop,
            sourceStart: scaleFrame(loop.sourceStart, frameRatio, 0),
            sourceEnd: scaleFrame(loop.sourceEnd, frameRatio, 1),
            loopEnd: scaleFrame(loop.loopEnd, frameRatio, 1),
          };
        })
      : [],
    totalFrames
  );

  const cutPositionsWithCoords = normalizeCutPositions(raw.cutPositionsWithCoords, frameRatio);
  const legacyTabRef = raw.tabRef;
  const legacyMaxFret = Array.isArray(legacyTabRef) && Array.isArray(legacyTabRef[0])
    ? legacyTabRef[0].length - 1
    : DEFAULT_MAX_FRET;
  const maxFret = clampInt(raw.maxFret, legacyMaxFret, 1, 36);
  const tuning = normalizeTuning(raw.tuning, legacyTabRef);

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : fallbackEditorId;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled";
  const editorType = normalizeEditorType(raw.editorType ?? raw.trackType ?? raw.type);
  const chordEditor = normalizeChordEditor(raw.chordEditor);

  return {
    ...base,
    ...raw,
    id,
    name,
    editorType,
    type: editorType,
    trackType: editorType,
    ...(chordEditor ? { chordEditor } : {}),
    instrumentId: normalizeTrackInstrumentId(raw.instrumentId),
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : base.updatedAt,
    framesPerMessure: FIXED_FRAMES_PER_BAR,
    fps,
    totalFrames,
    timeSignature,
    timeSignatureBottom,
    secondsPerBar,
    maxFret,
    notes,
    chords,
    noteEffects,
    drumLoops,
    cutPositionsWithCoords: cutPositionsWithCoords.length
      ? cutPositionsWithCoords
      : buildDefaultCutPositions(totalFrames),
    optimalsByTime: normalizeOptimalsByTime(raw.optimalsByTime, frameRatio),
    tuning,
  };
};

export const readGuestDraft = (): EditorSnapshot | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(GTE_GUEST_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestDraftRecord | EditorSnapshot;
    const snapshot =
      parsed && typeof parsed === "object" && "snapshot" in parsed
        ? (parsed as GuestDraftRecord).snapshot
        : (parsed as EditorSnapshot);
    return normalizeGuestSnapshot(snapshot, GTE_GUEST_EDITOR_ID);
  } catch {
    return null;
  }
};

export const writeGuestDraft = (snapshot: EditorSnapshot) => {
  if (typeof window === "undefined") return;
  const normalized = normalizeGuestSnapshot(snapshot, GTE_GUEST_EDITOR_ID);
  const payload: GuestDraftRecord = {
    version: 1,
    savedAt: new Date().toISOString(),
    snapshot: {
      ...normalized,
      id: GTE_GUEST_EDITOR_ID,
      updatedAt: new Date().toISOString(),
    },
  };
  window.localStorage.setItem(GTE_GUEST_DRAFT_STORAGE_KEY, JSON.stringify(payload));
};

export const clearGuestDraft = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GTE_GUEST_DRAFT_STORAGE_KEY);
};
