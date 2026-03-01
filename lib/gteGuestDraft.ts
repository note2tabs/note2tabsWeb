import type { CutWithCoord, EditorSnapshot, TabCoord } from "../types/gte";

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

const buildDefaultTabRef = (maxFret: number) => {
  return STANDARD_TUNING_MIDI.map((base) =>
    Array.from({ length: maxFret + 1 }, (_, fret) => base + fret)
  );
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

const buildNormalizedTabRef = (value: unknown): number[][] => {
  const fallback = buildDefaultTabRef(DEFAULT_MAX_FRET);
  if (!Array.isArray(value)) return fallback;
  return fallback.map((fallbackString, stringIndex) => {
    const source = value[stringIndex];
    if (!Array.isArray(source)) return fallbackString;
    const normalized = source
      .map((fretValue) => toFiniteNumber(fretValue, NaN))
      .filter((fretValue) => Number.isFinite(fretValue));
    const base = normalized.length ? normalized[0] : fallbackString[0];
    return Array.from({ length: DEFAULT_MAX_FRET + 1 }, (_, fret) => normalized[fret] ?? base + fret);
  });
};

const normalizeTab = (value: unknown): TabCoord | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const stringIndex = clampInt(value[0], 0, 0, 5);
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

export const createGuestSnapshot = (editorId: string = GTE_GUEST_EDITOR_ID): EditorSnapshot => {
  return {
    id: editorId,
    name: "Untitled",
    schemaVersion: 1,
    version: 1,
    updatedAt: new Date().toISOString(),
    timeSignature: DEFAULT_TIME_SIGNATURE,
    framesPerMessure: FIXED_FRAMES_PER_BAR,
    fps: DEFAULT_FPS,
    totalFrames: DEFAULT_TOTAL_FRAMES,
    secondsPerBar: DEFAULT_SECONDS_PER_BAR,
    notes: [],
    chords: [],
    cutPositionsWithCoords: buildDefaultCutPositions(DEFAULT_TOTAL_FRAMES),
    optimalsByTime: {},
    tabRef: buildDefaultTabRef(DEFAULT_MAX_FRET),
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
          if (!currentTabs.length) return null;
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
          };
        })
        .filter((chord): chord is EditorSnapshot["chords"][number] => chord !== null)
    : [];

  const cutPositionsWithCoords = normalizeCutPositions(raw.cutPositionsWithCoords, frameRatio);
  const tabRef = buildNormalizedTabRef(raw.tabRef);

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : fallbackEditorId;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled";

  return {
    ...base,
    ...raw,
    id,
    name,
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : base.updatedAt,
    framesPerMessure: FIXED_FRAMES_PER_BAR,
    fps,
    totalFrames,
    timeSignature,
    secondsPerBar,
    notes,
    chords,
    cutPositionsWithCoords: cutPositionsWithCoords.length
      ? cutPositionsWithCoords
      : buildDefaultCutPositions(totalFrames),
    optimalsByTime: normalizeOptimalsByTime(raw.optimalsByTime, frameRatio),
    tabRef,
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
