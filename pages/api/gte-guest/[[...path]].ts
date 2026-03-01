import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import {
  GTE_GUEST_EDITOR_ID,
  createGuestSnapshot,
  normalizeGuestSnapshot,
} from "../../../lib/gteGuestDraft";
import type { CanvasSnapshot, CutWithCoord, EditorSnapshot, TabCoord } from "../../../types/gte";

const COOKIE_NAME = "note2tabs_gte_guest_session";
const STORE_LIMIT = 200;
const LANE_DELIMITER = "__ed__";
const FIXED_FRAMES_PER_BAR = 480;
const DEFAULT_SECONDS_PER_BAR = 2;
const DEFAULT_MAX_FRET = 22;
const DEFAULT_CUT_COORD: TabCoord = [2, 0];
const MAX_EVENT_LENGTH_FRAMES = 800;
const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40];

type GuestEntry = { canvas: CanvasSnapshot; updatedAt: number };

const guestStore = new Map<string, GuestEntry>();

const getPath = (req: NextApiRequest) => (Array.isArray(req.query.path) ? req.query.path.join("/") : "");
const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clampEventLength = (value: number) => clamp(Math.round(toNumber(value, 1)), 1, MAX_EVENT_LENGTH_FRAMES);
const getStoreKey = (sessionId: string, canvasId: string) => `${sessionId}:${canvasId}`;
const getMaxFret = (lane: Pick<EditorSnapshot, "tabRef">) =>
  lane.tabRef?.[0]?.length ? lane.tabRef[0].length - 1 : DEFAULT_MAX_FRET;
const clampTab = (lane: Pick<EditorSnapshot, "tabRef">, tab?: TabCoord | null): TabCoord => {
  const source = tab ?? DEFAULT_CUT_COORD;
  return [
    clamp(Math.round(toNumber(source[0], 0)), 0, 5),
    clamp(Math.round(toNumber(source[1], 0)), 0, getMaxFret(lane)),
  ];
};
const buildDefaultCuts = (lane: Pick<EditorSnapshot, "tabRef" | "totalFrames">): CutWithCoord[] => [
  [[0, Math.max(FIXED_FRAMES_PER_BAR, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR)))], clampTab(lane)],
];

const normalizeLane = (raw: unknown, laneId: string, secondsFallback: number, index: number): EditorSnapshot => {
  const source =
    raw && typeof raw === "object"
      ? { ...(raw as Record<string, unknown>), secondsPerBar: toNumber((raw as any).secondsPerBar, secondsFallback) }
      : { secondsPerBar: secondsFallback };
  const lane = normalizeGuestSnapshot(source, laneId);
  return {
    ...lane,
    id: laneId,
    name: lane.name || `Editor ${index + 1}`,
    secondsPerBar: Math.max(0.1, toNumber(lane.secondsPerBar, secondsFallback)),
    cutPositionsWithCoords: lane.cutPositionsWithCoords.length ? lane.cutPositionsWithCoords : buildDefaultCuts(lane),
  };
};

const normalizeCanvas = (raw: unknown, fallbackCanvasId: string): CanvasSnapshot => {
  if (raw && typeof raw === "object" && Array.isArray((raw as CanvasSnapshot).editors)) {
    const source = raw as CanvasSnapshot;
    const seconds = Math.max(
      0.1,
      toNumber(source.secondsPerBar, toNumber(source.editors?.[0]?.secondsPerBar, DEFAULT_SECONDS_PER_BAR))
    );
    const editors = (source.editors || []).map((lane, index) =>
      normalizeLane(lane, lane.id || `ed-${index + 1}`, seconds, index)
    );
    return {
      id: source.id || fallbackCanvasId,
      name: source.name || "Untitled",
      schemaVersion: source.schemaVersion ?? 1,
      canvasSchemaVersion: source.canvasSchemaVersion ?? 1,
      version: Math.max(1, Math.round(toNumber(source.version, 1))),
      updatedAt: source.updatedAt || new Date().toISOString(),
      secondsPerBar: seconds,
      editors: editors.length ? editors : [normalizeLane(createGuestSnapshot("ed-1"), "ed-1", seconds, 0)],
    };
  }
  const lane = normalizeLane(raw, "ed-1", DEFAULT_SECONDS_PER_BAR, 0);
  return {
    id: fallbackCanvasId,
    name: lane.name || "Untitled",
    schemaVersion: 1,
    canvasSchemaVersion: 1,
    version: 1,
    updatedAt: lane.updatedAt || new Date().toISOString(),
    secondsPerBar: lane.secondsPerBar || DEFAULT_SECONDS_PER_BAR,
    editors: [lane],
  };
};

const buildDefaultCanvas = (editorId: string): CanvasSnapshot =>
  normalizeCanvas(
    { id: editorId, name: "Untitled", editors: [{ ...createGuestSnapshot("ed-1"), id: "ed-1", name: "Editor 1" }] },
    editorId
  );

const ensureSessionId = (req: NextApiRequest, res: NextApiResponse) => {
  const existing = req.cookies?.[COOKIE_NAME];
  if (existing) return existing;
  const sessionId = randomUUID();
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
  return sessionId;
};

const pruneStore = () => {
  if (guestStore.size <= STORE_LIMIT) return;
  const entries = Array.from(guestStore.entries()).sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  entries.slice(0, entries.length - STORE_LIMIT).forEach(([key]) => guestStore.delete(key));
};

const getCanvas = (sessionId: string, canvasId: string) =>
  guestStore.get(getStoreKey(sessionId, canvasId))?.canvas ?? buildDefaultCanvas(canvasId);

const persistCanvas = (sessionId: string, canvas: CanvasSnapshot) => {
  const normalized = normalizeCanvas(canvas, canvas.id);
  guestStore.set(getStoreKey(sessionId, normalized.id), { canvas: normalized, updatedAt: Date.now() });
  pruneStore();
  return normalized;
};

const parseEditorRef = (editorRef: string) => {
  const splitIndex = editorRef.indexOf(LANE_DELIMITER);
  return splitIndex < 0
    ? { canvasId: editorRef, laneId: null as string | null }
    : {
        canvasId: editorRef.slice(0, splitIndex) || GTE_GUEST_EDITOR_ID,
        laneId: editorRef.slice(splitIndex + LANE_DELIMITER.length) || null,
      };
};

const touchCanvas = (canvas: CanvasSnapshot): CanvasSnapshot => ({
  ...canvas,
  version: Math.max(1, Math.round(toNumber(canvas.version, 1))) + 1,
  updatedAt: new Date().toISOString(),
});

const requireLane = (canvas: CanvasSnapshot, laneId: string | null) => {
  if (!laneId) throw new Error("Track not found.");
  const laneIndex = canvas.editors.findIndex((lane) => lane.id === laneId);
  if (laneIndex < 0) throw new Error("Track not found.");
  return { laneIndex, lane: canvas.editors[laneIndex] };
};

const applyLaneMutation = (canvas: CanvasSnapshot, laneId: string, mutate: (lane: EditorSnapshot) => void) => {
  const { laneIndex, lane } = requireLane(canvas, laneId);
  const nextLane = clone(lane);
  mutate(nextLane);
  nextLane.updatedAt = new Date().toISOString();
  const nextEditors = [...canvas.editors];
  nextEditors[laneIndex] = normalizeLane(nextLane, laneId, toNumber(nextLane.secondsPerBar, DEFAULT_SECONDS_PER_BAR), laneIndex);
  const nextCanvas = normalizeCanvas(touchCanvas({ ...canvas, editors: nextEditors }), canvas.id);
  return { canvas: nextCanvas, snapshot: nextCanvas.editors[laneIndex] };
};

const getTabMidi = (lane: EditorSnapshot, tab: TabCoord) => {
  const fromRef = lane.tabRef?.[tab[0]]?.[tab[1]];
  if (fromRef !== undefined && fromRef !== null && Number.isFinite(Number(fromRef))) return Number(fromRef);
  const base = STANDARD_TUNING_MIDI[tab[0]];
  return Number.isFinite(base) ? base + tab[1] : 0;
};

const nextNoteId = (lane: EditorSnapshot) => lane.notes.reduce((max, note) => Math.max(max, note.id), 0) + 1;
const nextChordId = (lane: EditorSnapshot) => lane.chords.reduce((max, chord) => Math.max(max, chord.id), 0) + 1;
const signatureLength = (lane: EditorSnapshot) =>
  Math.max(1, Math.floor(FIXED_FRAMES_PER_BAR / Math.max(1, Math.min(64, Math.round(toNumber(lane.timeSignature, 4))))));
const snapStart = (lane: EditorSnapshot, value: number, enabled: boolean) => {
  const safe = Math.max(0, Math.round(toNumber(value, 0)));
  if (!enabled) return safe;
  const unit = signatureLength(lane);
  const barIndex = Math.floor(safe / FIXED_FRAMES_PER_BAR);
  const barOffset = barIndex * FIXED_FRAMES_PER_BAR;
  return Math.max(0, Math.floor((safe - barOffset) / unit) * unit + barOffset);
};
const snapLength = (lane: EditorSnapshot, value: number, enabled: boolean) => {
  const safe = clampEventLength(value);
  if (!enabled) return safe;
  const unit = signatureLength(lane);
  return clampEventLength(Math.max(1, Math.floor(safe / unit)) * unit);
};
const parseSnapToGrid = (req: NextApiRequest, body: Record<string, any>) => {
  const raw = req.query.snapToGrid ?? req.query.snap_to_grid ?? body.snapToGrid ?? body.snap_to_grid;
  if (typeof raw === "boolean") return raw;
  if (Array.isArray(raw)) return raw[0] === "true" || raw[0] === "1";
  if (typeof raw === "string") return raw === "true" || raw === "1";
  return Boolean(raw);
};

const removeSingleBarFromLane = (lane: EditorSnapshot, index: number) => {
  const totalBars = Math.max(1, Math.ceil(Math.max(FIXED_FRAMES_PER_BAR, lane.totalFrames) / FIXED_FRAMES_PER_BAR));
  if (totalBars <= 1) return null;
  const safeIndex = clamp(Math.round(toNumber(index, 0)), 0, totalBars - 1);
  const removeStart = safeIndex * FIXED_FRAMES_PER_BAR;
  const removeEnd = removeStart + FIXED_FRAMES_PER_BAR;
  const next = clone(lane);
  next.notes = next.notes
    .filter((note) => {
      const start = Math.round(toNumber(note.startTime, 0));
      const end = start + clampEventLength(note.length);
      return end <= removeStart || start >= removeEnd;
    })
    .map((note) => {
      const start = Math.round(toNumber(note.startTime, 0));
      return start < removeEnd ? note : { ...note, startTime: start - FIXED_FRAMES_PER_BAR };
    });
  next.chords = next.chords
    .filter((chord) => {
      const start = Math.round(toNumber(chord.startTime, 0));
      const end = start + clampEventLength(chord.length);
      return end <= removeStart || start >= removeEnd;
    })
    .map((chord) => {
      const start = Math.round(toNumber(chord.startTime, 0));
      return start < removeEnd ? chord : { ...chord, startTime: start - FIXED_FRAMES_PER_BAR };
    });
  next.cutPositionsWithCoords = next.cutPositionsWithCoords.flatMap(([region, coord]) => {
    const start = Math.round(toNumber(region[0], 0));
    const end = Math.round(toNumber(region[1], start));
    if (end <= removeStart) return [[[start, end], coord] as CutWithCoord];
    if (start >= removeEnd) return [[[start - FIXED_FRAMES_PER_BAR, end - FIXED_FRAMES_PER_BAR], coord] as CutWithCoord];
    const result: CutWithCoord[] = [];
    if (start < removeStart) result.push([[start, removeStart], [coord[0], coord[1]]]);
    if (end > removeEnd) result.push([[removeStart, end - FIXED_FRAMES_PER_BAR], [coord[0], coord[1]]]);
    return result;
  });
  next.totalFrames = Math.max(FIXED_FRAMES_PER_BAR, next.totalFrames - FIXED_FRAMES_PER_BAR);
  if (!next.cutPositionsWithCoords.length) next.cutPositionsWithCoords = buildDefaultCuts(next);
  return next;
};

const reorderSingleBarInLane = (lane: EditorSnapshot, fromIndex: number, toIndex: number) => {
  const totalBars = Math.max(1, Math.ceil(Math.max(FIXED_FRAMES_PER_BAR, lane.totalFrames) / FIXED_FRAMES_PER_BAR));
  const safeFrom = clamp(Math.round(toNumber(fromIndex, 0)), 0, totalBars - 1);
  const safeTo = clamp(Math.round(toNumber(toIndex, 0)), 0, totalBars);
  if (safeFrom === safeTo || safeFrom + 1 === safeTo) return lane;
  const start = safeFrom * FIXED_FRAMES_PER_BAR;
  const end = start + FIXED_FRAMES_PER_BAR;
  const insertStart = (safeTo > safeFrom ? safeTo - 1 : safeTo) * FIXED_FRAMES_PER_BAR;
  const shifted = removeSingleBarFromLane(lane, safeFrom);
  if (!shifted) return null;
  const next = clone(shifted);
  const moveFrame = (value: number) => (value >= start && value < end ? value - start + insertStart : value);
  next.notes = [
    ...next.notes.map((note) => {
      const original = lane.notes.find((candidate) => candidate.id === note.id);
      if (!original) return note;
      const rawStart = Math.round(toNumber(original.startTime, 0));
      if (rawStart >= start && rawStart < end) return null;
      return note;
    }).filter(Boolean) as EditorSnapshot["notes"],
    ...lane.notes
      .filter((note) => note.startTime >= start && note.startTime < end)
      .map((note) => ({ ...note, startTime: moveFrame(note.startTime) })),
  ].sort((a, b) => a.startTime - b.startTime || a.id - b.id);
  next.chords = [
    ...next.chords.filter((chord) => chord.startTime < start || chord.startTime >= end),
    ...lane.chords
      .filter((chord) => chord.startTime >= start && chord.startTime < end)
      .map((chord) => ({ ...chord, startTime: moveFrame(chord.startTime) })),
  ].sort((a, b) => a.startTime - b.startTime || a.id - b.id);
  next.cutPositionsWithCoords = buildDefaultCuts(next);
  return next;
};

const getAllTabsForMidi = (lane: EditorSnapshot, midi: number) => {
  const result: TabCoord[] = [];
  lane.tabRef?.forEach((stringValues, stringIndex) => {
    stringValues?.forEach((value, fret) => {
      if (Number(value) === midi) result.push([stringIndex, fret]);
    });
  });
  return result.length ? result : [clampTab(lane)];
};

const getNoteOptimals = (lane: EditorSnapshot, note: EditorSnapshot["notes"][number]) => {
  const midi = note.midiNum || getTabMidi(lane, note.tab);
  const tabs = getAllTabsForMidi(lane, midi);
  const blocked = new Set<string>();
  const noteStart = Math.round(toNumber(note.startTime, 0));
  const noteEnd = noteStart + clampEventLength(note.length);
  lane.notes.forEach((item) => {
    if (item.id === note.id) return;
    const start = Math.round(toNumber(item.startTime, 0));
    const end = start + clampEventLength(item.length);
    if (start < noteEnd && noteStart < end) blocked.add(`${item.tab[0]}:${item.tab[1]}`);
  });
  lane.chords.forEach((chord) => {
    const start = Math.round(toNumber(chord.startTime, 0));
    const end = start + clampEventLength(chord.length);
    if (start < noteEnd && noteStart < end) chord.currentTabs.forEach((tab) => blocked.add(`${tab[0]}:${tab[1]}`));
  });
  return {
    possibleTabs: tabs.filter((tab) => !blocked.has(`${tab[0]}:${tab[1]}`)),
    blockedTabs: tabs.filter((tab) => blocked.has(`${tab[0]}:${tab[1]}`)),
  };
};

const applyManualCuts = (lane: EditorSnapshot, cuts: CutWithCoord[]) => {
  lane.cutPositionsWithCoords = Array.isArray(cuts) && cuts.length ? cuts.map((entry) => [[entry[0][0], entry[0][1]], clampTab(lane, entry[1])]) : buildDefaultCuts(lane);
};

const shiftCutBoundary = (lane: EditorSnapshot, boundaryIndex: number, newTime: number) => {
  const cuts = clone(lane.cutPositionsWithCoords);
  if (boundaryIndex < 0 || boundaryIndex >= cuts.length - 1) return;
  const left = cuts[boundaryIndex];
  const right = cuts[boundaryIndex + 1];
  const time = clamp(Math.round(toNumber(newTime, left[0][1])), left[0][0] + 1, right[0][1] - 1);
  left[0][1] = time;
  right[0][0] = time;
  lane.cutPositionsWithCoords = cuts;
};

const insertCut = (lane: EditorSnapshot, time: number, coord?: TabCoord) => {
  const cuts = clone(lane.cutPositionsWithCoords.length ? lane.cutPositionsWithCoords : buildDefaultCuts(lane));
  const insertTime = clamp(Math.round(toNumber(time, 1)), 1, Math.max(1, lane.totalFrames - 1));
  const index = cuts.findIndex((entry) => entry[0][0] < insertTime && entry[0][1] > insertTime);
  if (index < 0) return;
  const [region, existing] = cuts[index];
  cuts.splice(index, 1, [[region[0], insertTime], existing], [[insertTime, region[1]], clampTab(lane, coord ?? existing)]);
  lane.cutPositionsWithCoords = cuts;
};

const deleteCutBoundary = (lane: EditorSnapshot, boundaryIndex: number) => {
  const cuts = clone(lane.cutPositionsWithCoords.length ? lane.cutPositionsWithCoords : buildDefaultCuts(lane));
  if (boundaryIndex < 0 || boundaryIndex >= cuts.length - 1) return;
  const left = cuts[boundaryIndex];
  const right = cuts[boundaryIndex + 1];
  cuts.splice(boundaryIndex, 2, [[left[0][0], right[0][1]], [left[1][0], left[1][1]]]);
  lane.cutPositionsWithCoords = cuts;
};

const generateCuts = (lane: EditorSnapshot) => {
  const events = [
    ...lane.notes.map((note) => ({ time: Math.round(toNumber(note.startTime, 0)), coord: clampTab(lane, note.tab) })),
    ...lane.chords.filter((chord) => chord.currentTabs.length > 0).map((chord) => ({
      time: Math.round(toNumber(chord.startTime, 0)),
      coord: clampTab(lane, chord.currentTabs[0]),
    })),
  ].sort((a, b) => a.time - b.time);
  if (!events.length) {
    lane.cutPositionsWithCoords = buildDefaultCuts(lane);
    return;
  }
  const points = Array.from(new Set([0, ...events.map((event) => clamp(event.time, 0, lane.totalFrames)), lane.totalFrames])).sort(
    (a, b) => a - b
  );
  lane.cutPositionsWithCoords = points.slice(0, -1).map((start, index) => {
    let coord = clampTab(lane);
    events.forEach((event) => {
      if (event.time <= start) coord = [event.coord[0], event.coord[1]];
    });
    return [[start, points[index + 1]], coord] as CutWithCoord;
  });
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = req.method || "GET";
  const path = getPath(req);
  const sessionId = ensureSessionId(req, res);
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, any>) : {};

  try {
    if (path === "editors" && method === "GET") {
      const canvas = getCanvas(sessionId, GTE_GUEST_EDITOR_ID);
      return res.status(200).json({
        editors: [
          {
            id: canvas.id,
            name: canvas.name,
            updatedAt: canvas.updatedAt,
            version: canvas.version,
            totalFrames: Math.max(...canvas.editors.map((lane) => lane.totalFrames), FIXED_FRAMES_PER_BAR),
            framesPerMessure: FIXED_FRAMES_PER_BAR,
            noteCount: canvas.editors.reduce((sum, lane) => sum + lane.notes.length, 0),
            chordCount: canvas.editors.reduce((sum, lane) => sum + lane.chords.length, 0),
          },
        ],
      });
    }

    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "editors" || !parts[1]) return res.status(404).json({ error: "Not found" });

    const editorRef = decodeURIComponent(parts[1]);
    const { canvasId, laneId } = parseEditorRef(editorRef);
    let canvas = getCanvas(sessionId, canvasId);
    const rest = parts.slice(2);

    if (!rest.length) {
      if (method === "GET") {
        return res.status(200).json(laneId ? requireLane(canvas, laneId).lane : canvas);
      }
      if (method === "DELETE" && !laneId) {
        guestStore.delete(getStoreKey(sessionId, canvasId));
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (rest[0] === "snapshot" && method === "POST") {
      if (laneId) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const next = normalizeLane(body.snapshot, laneId, toNumber(lane.secondsPerBar, DEFAULT_SECONDS_PER_BAR), 0);
          Object.assign(lane, next);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      canvas = persistCanvas(sessionId, normalizeCanvas(body.snapshot ?? canvas, canvasId));
      return res.status(200).json({ ok: true, snapshot: canvas, canvas });
    }

    if (rest[0] === "commit" && method === "POST") {
      canvas = persistCanvas(sessionId, touchCanvas(canvas));
      return res.status(200).json({ ok: true, snapshot: laneId ? requireLane(canvas, laneId).lane : canvas });
    }

    if (rest[0] === "name" && method === "POST" && !laneId) {
      canvas = persistCanvas(
        sessionId,
        touchCanvas({ ...canvas, name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Untitled" })
      );
      return res.status(200).json({ ok: true, snapshot: canvas, canvas });
    }

    if (rest[0] === "canvas" && !laneId) {
      if (rest[1] === "editors" && method === "POST" && rest.length === 2) {
        const existing = new Set(canvas.editors.map((lane) => lane.id));
        let laneNumber = canvas.editors.length + 1;
        while (existing.has(`ed-${laneNumber}`)) laneNumber += 1;
        const nextLane = normalizeLane(
          {
            ...createGuestSnapshot(`ed-${laneNumber}`),
            id: `ed-${laneNumber}`,
            name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : `Editor ${laneNumber}`,
            secondsPerBar: canvas.secondsPerBar,
          },
          `ed-${laneNumber}`,
          toNumber(canvas.secondsPerBar, DEFAULT_SECONDS_PER_BAR),
          canvas.editors.length
        );
        canvas = persistCanvas(sessionId, touchCanvas({ ...canvas, editors: [...canvas.editors, nextLane] }));
        return res.status(200).json({ ok: true, canvas, editor: nextLane });
      }

      if (rest[1] === "editors" && rest[2] === "reorder" && method === "POST") {
        const sourceIndex = canvas.editors.findIndex((lane) => lane.id === String(body.laneId || ""));
        const targetIndex = clamp(Math.round(toNumber(body.toIndex, sourceIndex)), 0, Math.max(0, canvas.editors.length - 1));
        if (sourceIndex < 0) throw new Error("Track not found.");
        if (sourceIndex === targetIndex) return res.status(200).json({ ok: true, canvas });
        const nextEditors = [...canvas.editors];
        const [moved] = nextEditors.splice(sourceIndex, 1);
        if (!moved) throw new Error("Track not found.");
        nextEditors.splice(targetIndex, 0, moved);
        canvas = persistCanvas(sessionId, touchCanvas({ ...canvas, editors: nextEditors }));
        return res.status(200).json({ ok: true, canvas });
      }

      if (rest[1] === "editors" && rest[2] && method === "DELETE") {
        const laneToDelete = decodeURIComponent(rest[2]);
        if (canvas.editors.length <= 1) throw new Error("Cannot remove the final track.");
        const nextEditors = canvas.editors.filter((lane) => lane.id !== laneToDelete);
        if (nextEditors.length === canvas.editors.length) throw new Error("Track not found.");
        canvas = persistCanvas(sessionId, touchCanvas({ ...canvas, editors: nextEditors }));
        return res.status(200).json({ ok: true, canvas, removedEditorId: laneToDelete });
      }
    }

    if (rest[0] === "seconds_per_bar" && method === "POST" && !laneId) {
      const nextSeconds = Math.max(0.1, toNumber(body.secondsPerBar, DEFAULT_SECONDS_PER_BAR));
      canvas = persistCanvas(
        sessionId,
        normalizeCanvas(
          touchCanvas({
            ...canvas,
            secondsPerBar: nextSeconds,
            editors: canvas.editors.map((lane) => ({
              ...lane,
              secondsPerBar: nextSeconds,
              fps: Math.max(1, Math.round(FIXED_FRAMES_PER_BAR / nextSeconds)),
            })),
          }),
          canvas.id
        )
      );
      return res.status(200).json({ ok: true, snapshot: canvas.editors[0], canvas });
    }

    if (rest[0] === "seconds_per_bar" && method === "POST" && laneId) {
      const nextSeconds = Math.max(0.1, toNumber(body.secondsPerBar, DEFAULT_SECONDS_PER_BAR));
      const result = applyLaneMutation(canvas, laneId, (lane) => {
        lane.secondsPerBar = nextSeconds;
        lane.fps = Math.max(1, Math.round(FIXED_FRAMES_PER_BAR / nextSeconds));
      });
      canvas = persistCanvas(sessionId, result.canvas);
      return res.status(200).json({ ok: true, snapshot: result.snapshot, canvas });
    }

    if (rest[0] === "time_signature" && method === "POST" && laneId) {
      const result = applyLaneMutation(canvas, laneId, (lane) => {
        lane.timeSignature = clamp(Math.round(toNumber(body.timeSignature, 4)), 1, 64);
      });
      canvas = persistCanvas(sessionId, result.canvas);
      return res.status(200).json({ ok: true, snapshot: result.snapshot, canvas });
    }

    if (rest[0] === "bars" && laneId) {
      if (rest[1] === "add" && method === "POST") {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          lane.totalFrames = Math.max(FIXED_FRAMES_PER_BAR, lane.totalFrames + Math.max(1, Math.round(toNumber(body.count, 1))) * FIXED_FRAMES_PER_BAR);
          if (!lane.cutPositionsWithCoords.length) lane.cutPositionsWithCoords = buildDefaultCuts(lane);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[1] === "remove" && method === "POST") {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const next = removeSingleBarFromLane(lane, body.index);
          if (!next) throw new Error("Unable to remove bar.");
          Object.assign(lane, next);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[1] === "reorder" && method === "POST") {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const next = reorderSingleBarInLane(lane, body.fromIndex, body.toIndex);
          if (!next) throw new Error("Unable to reorder bar.");
          Object.assign(lane, next);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
    }

    if (rest[0] === "notes" && laneId) {
      const noteId = rest[1] ? Math.round(toNumber(rest[1], 0)) : null;
      if (method === "POST" && rest.length === 1) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const tab = clampTab(lane, Array.isArray(body.tab) ? (body.tab as TabCoord) : DEFAULT_CUT_COORD);
          const snap = parseSnapToGrid(req, body);
          const startTime = snapStart(lane, body.startTime, snap);
          const length = snapLength(lane, body.length, snap);
          lane.notes.push({ id: nextNoteId(lane), startTime, length, midiNum: getTabMidi(lane, tab), tab, optimals: [] });
          lane.notes.sort((a, b) => a.startTime - b.startTime || a.id - b.id);
          lane.totalFrames = Math.max(lane.totalFrames, startTime + length);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (method === "DELETE" && rest.length === 2 && noteId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          lane.notes = lane.notes.filter((note) => note.id !== noteId);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "assign_tab" && method === "POST" && noteId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const note = lane.notes.find((item) => item.id === noteId);
          if (!note) throw new Error("Note not found.");
          note.tab = clampTab(lane, Array.isArray(body.tab) ? (body.tab as TabCoord) : note.tab);
          note.midiNum = getTabMidi(lane, note.tab);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "set_start_time" && method === "POST" && noteId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const note = lane.notes.find((item) => item.id === noteId);
          if (!note) throw new Error("Note not found.");
          note.startTime = snapStart(lane, body.startTime ?? body.start_time, parseSnapToGrid(req, body));
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "set_length" && method === "POST" && noteId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const note = lane.notes.find((item) => item.id === noteId);
          if (!note) throw new Error("Note not found.");
          note.length = snapLength(lane, body.length, parseSnapToGrid(req, body));
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "optimals" && method === "GET" && noteId !== null) {
        const note = requireLane(canvas, laneId).lane.notes.find((item) => item.id === noteId);
        if (!note) throw new Error("Note not found.");
        const optimals = getNoteOptimals(requireLane(canvas, laneId).lane, note);
        return res.status(200).json({
          possibleTabs: optimals.possibleTabs.length ? optimals.possibleTabs : getAllTabsForMidi(requireLane(canvas, laneId).lane, note.midiNum || getTabMidi(requireLane(canvas, laneId).lane, note.tab)),
          blockedTabs: optimals.blockedTabs,
        });
      }
    }

    if (rest[0] === "optimals" && rest[1] === "assign" && method === "POST" && laneId) {
      const result = applyLaneMutation(canvas, laneId, (lane) => {
        const ids = new Set((Array.isArray(body.noteIds) ? body.noteIds : []).map((id: unknown) => Math.round(toNumber(id, 0))));
        lane.notes.forEach((note) => {
          if (!ids.has(note.id)) return;
          const optimals = getNoteOptimals(lane, note);
          const nextTab = (optimals.possibleTabs[0] || optimals.blockedTabs[0] || note.tab) as TabCoord;
          note.tab = [nextTab[0], nextTab[1]];
          note.midiNum = getTabMidi(lane, note.tab);
          note.optimals = [...optimals.possibleTabs];
        });
      });
      canvas = persistCanvas(sessionId, result.canvas);
      return res.status(200).json({ ok: true, snapshot: result.snapshot });
    }

    if (rest[0] === "chords" && laneId) {
      const chordId = rest[1] ? Math.round(toNumber(rest[1], 0)) : null;
      if (method === "POST" && rest.length === 1) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const noteIds = new Set((Array.isArray(body.noteIds) ? body.noteIds : []).map((id: unknown) => Math.round(toNumber(id, 0))));
          const notes = lane.notes.filter((note) => noteIds.has(note.id)).sort((a, b) => a.startTime - b.startTime || a.tab[0] - b.tab[0]);
          if (notes.length < 2) throw new Error("Select at least two notes.");
          const startTime = Math.min(...notes.map((note) => note.startTime));
          const endTime = Math.max(...notes.map((note) => note.startTime + clampEventLength(note.length)));
          const tabs = notes.map((note) => [note.tab[0], note.tab[1]] as TabCoord);
          lane.chords.push({
            id: nextChordId(lane),
            startTime,
            length: clampEventLength(endTime - startTime),
            originalMidi: notes.map((note) => note.midiNum || getTabMidi(lane, note.tab)),
            currentTabs: tabs,
            ogTabs: tabs.map((tab) => [tab[0], tab[1]] as TabCoord),
          });
          lane.notes = lane.notes.filter((note) => !noteIds.has(note.id));
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (method === "DELETE" && rest.length === 2 && chordId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          lane.chords = lane.chords.filter((chord) => chord.id !== chordId);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "disband" && method === "POST" && chordId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const index = lane.chords.findIndex((chord) => chord.id === chordId);
          if (index < 0) throw new Error("Chord not found.");
          const chord = lane.chords[index];
          const baseId = nextNoteId(lane);
          lane.notes.push(
            ...chord.currentTabs.map((tab, offset) => ({
              id: baseId + offset,
              startTime: chord.startTime,
              length: chord.length,
              midiNum: getTabMidi(lane, tab),
              tab: [tab[0], tab[1]] as TabCoord,
              optimals: [],
            }))
          );
          lane.chords.splice(index, 1);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "set_start_time" && method === "POST" && chordId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const chord = lane.chords.find((item) => item.id === chordId);
          if (!chord) throw new Error("Chord not found.");
          chord.startTime = snapStart(lane, body.startTime ?? body.start_time, parseSnapToGrid(req, body));
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "set_length" && method === "POST" && chordId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const chord = lane.chords.find((item) => item.id === chordId);
          if (!chord) throw new Error("Chord not found.");
          chord.length = snapLength(lane, body.length, parseSnapToGrid(req, body));
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "slice" && method === "POST" && chordId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const chord = lane.chords.find((item) => item.id === chordId);
          if (!chord) throw new Error("Chord not found.");
          const split = clamp(Math.round(toNumber(body.time, chord.startTime + 1)), chord.startTime + 1, chord.startTime + clampEventLength(chord.length) - 1);
          const originalEnd = chord.startTime + clampEventLength(chord.length);
          chord.length = clampEventLength(split - chord.startTime);
          lane.chords.push({
            id: nextChordId(lane),
            startTime: split,
            length: clampEventLength(originalEnd - split),
            originalMidi: [...chord.originalMidi],
            currentTabs: chord.currentTabs.map((tab) => [tab[0], tab[1]] as TabCoord),
            ogTabs: chord.ogTabs.map((tab) => [tab[0], tab[1]] as TabCoord),
          });
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "tabs" && method === "POST" && chordId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const chord = lane.chords.find((item) => item.id === chordId);
          if (!chord) throw new Error("Chord not found.");
          chord.currentTabs = (Array.isArray(body.tabs) ? body.tabs : []).map((tab) => clampTab(lane, tab as TabCoord));
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[2] === "alternatives" && method === "GET" && chordId !== null) {
        const chord = requireLane(canvas, laneId).lane.chords.find((item) => item.id === chordId);
        if (!chord) throw new Error("Chord not found.");
        const current = chord.currentTabs.map((tab) => [tab[0], tab[1]] as TabCoord);
        const original = chord.ogTabs.map((tab) => [tab[0], tab[1]] as TabCoord);
        return res.status(200).json({ alternatives: [current, original].filter((item, index, list) => index === 0 || JSON.stringify(item) !== JSON.stringify(list[0])) });
      }
      if (rest[2] === "octave" && method === "POST" && chordId !== null) {
        const result = applyLaneMutation(canvas, laneId, (lane) => {
          const chord = lane.chords.find((item) => item.id === chordId);
          if (!chord) throw new Error("Chord not found.");
          const delta = Math.round(toNumber(body.direction, 0)) * 12;
          chord.currentTabs = chord.currentTabs.map((tab) => [tab[0], clamp(tab[1] + delta, 0, getMaxFret(lane))]);
        });
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
    }

    if (rest[0] === "export" && method === "GET" && laneId) {
      const lane = requireLane(canvas, laneId).lane;
      const stamps: Array<[number, TabCoord, number]> = [];
      lane.notes.forEach((note) => stamps.push([note.startTime, [note.tab[0], note.tab[1]], clampEventLength(note.length)]));
      lane.chords.forEach((chord) =>
        chord.currentTabs.forEach((tab) => stamps.push([chord.startTime, [tab[0], tab[1]], clampEventLength(chord.length)]))
      );
      stamps.sort((a, b) => a[0] - b[0]);
      return res.status(200).json({
        stamps,
        framesPerMessure: FIXED_FRAMES_PER_BAR,
        fps: lane.fps,
        totalFrames: lane.totalFrames,
        tabStrings: ["e", "B", "G", "D", "A", "E"],
      });
    }

    if ((rest[0] === "import" || rest[0] === "import_append") && method === "POST" && laneId) {
      const append = rest[0] === "import_append";
      const result = applyLaneMutation(canvas, laneId, (lane) => {
        const baseOffset = append ? Math.max(FIXED_FRAMES_PER_BAR, lane.totalFrames) : 0;
        const baseId = append ? nextNoteId(lane) : 1;
        const notes = append ? [...lane.notes] : [];
        let cursor = baseId;
        (Array.isArray(body.stamps) ? body.stamps : []).forEach((entry: unknown) => {
          if (!Array.isArray(entry) || entry.length < 3) return;
          const tab = clampTab(lane, (entry[1] as TabCoord) || DEFAULT_CUT_COORD);
          const startTime = Math.max(0, Math.round(toNumber(entry[0], 0))) + baseOffset;
          const length = clampEventLength(entry[2]);
          notes.push({ id: cursor++, startTime, length, midiNum: getTabMidi(lane, tab), tab, optimals: [] });
        });
        lane.notes = notes.sort((a, b) => a.startTime - b.startTime || a.id - b.id);
        if (!append) lane.chords = [];
        lane.totalFrames = Math.max(baseOffset + Math.round(toNumber(body.totalFrames, FIXED_FRAMES_PER_BAR)), lane.totalFrames);
        lane.cutPositionsWithCoords = buildDefaultCuts(lane);
      });
      canvas = persistCanvas(sessionId, result.canvas);
      return res.status(200).json({ ok: true, snapshot: result.snapshot });
    }

    if (rest[0] === "cuts" && laneId) {
      if (rest[1] === "generate" && method === "POST") {
        const result = applyLaneMutation(canvas, laneId, (lane) => generateCuts(lane));
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[1] === "apply_manual" && method === "POST") {
        const result = applyLaneMutation(canvas, laneId, (lane) => applyManualCuts(lane, Array.isArray(body.cutPositionsWithCoords) ? body.cutPositionsWithCoords : []));
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[1] === "shift_boundary" && method === "POST") {
        const result = applyLaneMutation(canvas, laneId, (lane) => shiftCutBoundary(lane, body.boundaryIndex, body.newTime));
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[1] === "insert_at" && method === "POST") {
        const result = applyLaneMutation(canvas, laneId, (lane) => insertCut(lane, body.time, Array.isArray(body.coord) ? (body.coord as TabCoord) : undefined));
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
      if (rest[1] === "delete_boundary" && method === "POST") {
        const result = applyLaneMutation(canvas, laneId, (lane) => deleteCutBoundary(lane, body.boundaryIndex));
        canvas = persistCanvas(sessionId, result.canvas);
        return res.status(200).json({ ok: true, snapshot: result.snapshot });
      }
    }

    return res.status(404).json({ error: "Not found" });
  } catch (err: any) {
    const message = typeof err?.message === "string" && err.message ? err.message : "Guest editor request failed.";
    return res.status(400).json({ error: message });
  }
}
