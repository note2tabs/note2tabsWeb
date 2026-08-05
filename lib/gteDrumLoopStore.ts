import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type { CanvasSnapshot, DrumLoopRegion, EditorSnapshot } from "../types/gte";
import { normalizeDrumLoops } from "./gteDrumLoops";
import { prisma } from "./prisma";

const LANE_DELIMITER = "__ed__";
const TABLE = Prisma.raw(`"GteDrumLoopState"`);

type EditorRefParts = { canvasId: string; laneId: string | null };
type StoredLoopRow = { laneId: string; loops: unknown };
type LoopSelection = { laneId: string; loops: DrumLoopRegion[] };

let tableAvailability: "unknown" | "available" | "missing" = "unknown";
let missingTableLogged = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");
const isCanvas = (value: unknown): value is CanvasSnapshot =>
  isRecord(value) && Array.isArray((value as CanvasSnapshot).editors);
const isLane = (value: unknown): value is EditorSnapshot =>
  isRecord(value) && Array.isArray((value as EditorSnapshot).notes);
const parseEditorRef = (editorRef: string): EditorRefParts => {
  const splitIndex = editorRef.indexOf(LANE_DELIMITER);
  return splitIndex < 0
    ? { canvasId: editorRef, laneId: null }
    : {
        canvasId: editorRef.slice(0, splitIndex),
        laneId: editorRef.slice(splitIndex + LANE_DELIMITER.length) || null,
      };
};

const handleError = (error: unknown) => {
  const message = isRecord(error) && "message" in error ? String(error.message) : "";
  const code = isRecord(error) && "code" in error ? String(error.code) : "";
  if (code === "42P01" || /GteDrumLoopState|does not exist/i.test(message)) {
    tableAvailability = "missing";
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn("[gteDrumLoopStore] Drum loop table is missing. Run the Prisma migration.");
    }
    return;
  }
  console.warn("[gteDrumLoopStore] Drum loop persistence failed.", error);
};

const selectionFromLane = (lane: EditorSnapshot, laneIdOverride?: string): LoopSelection | null => {
  const laneId = (laneIdOverride || lane.id || "").trim();
  if (!laneId) return null;
  return {
    laneId,
    loops: normalizeDrumLoops(lane.drumLoops, lane.totalFrames),
  };
};

const collectSelections = (snapshot: unknown, ref: EditorRefParts): LoopSelection[] => {
  if (isCanvas(snapshot)) {
    return snapshot.editors
      .map((lane) => selectionFromLane(lane))
      .filter((entry): entry is LoopSelection => Boolean(entry));
  }
  if (isLane(snapshot) && ref.laneId) {
    const selection = selectionFromLane(snapshot, ref.laneId);
    return selection ? [selection] : [];
  }
  return [];
};

const loadRows = async (userId: string, canvasId: string) => {
  if (!userId || !canvasId || tableAvailability === "missing") return [];
  try {
    const rows = await prisma.$queryRaw<StoredLoopRow[]>(Prisma.sql`
      SELECT "laneId", "loops"
      FROM ${TABLE}
      WHERE "userId" = ${userId} AND "editorId" = ${canvasId}
    `);
    tableAvailability = "available";
    return rows;
  } catch (error) {
    handleError(error);
    return [];
  }
};

const applyRows = (value: unknown, laneId: string | null, rows: StoredLoopRow[]) => {
  const byLane = new Map(rows.map((row) => [row.laneId, row.loops]));
  const applyLane = (lane: EditorSnapshot, id: string) => {
    const stored = byLane.get(id);
    if (stored === undefined) return;
    lane.drumLoops = normalizeDrumLoops(stored, lane.totalFrames);
  };
  if (isCanvas(value)) {
    value.editors.forEach((lane) => applyLane(lane, lane.id));
  } else if (isLane(value) && laneId) {
    applyLane(value, laneId);
  }
};

export const hydrateDrumLoopsFromStore = async <T>(
  userId: string,
  editorRef: string | null,
  payload: T
): Promise<T> => {
  if (!editorRef || !isRecord(payload) || tableAvailability === "missing") return payload;
  const ref = parseEditorRef(editorRef);
  const rows = await loadRows(userId, ref.canvasId);
  if (!rows.length) return payload;
  applyRows(payload, ref.laneId, rows);
  if ("canvas" in payload) applyRows(payload.canvas, ref.laneId, rows);
  if ("snapshot" in payload) applyRows(payload.snapshot, ref.laneId, rows);
  return payload;
};

export const persistDrumLoopsFromSnapshot = async (
  userId: string,
  editorRef: string | null,
  snapshot: unknown
) => {
  if (!editorRef || tableAvailability === "missing") return;
  const ref = parseEditorRef(editorRef);
  const selections = collectSelections(snapshot, ref);
  if (!selections.length && !isCanvas(snapshot)) return;
  try {
    await prisma.$transaction(async (tx) => {
      if (isCanvas(snapshot)) {
        const laneIds = selections.map((entry) => entry.laneId);
        if (laneIds.length) {
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM ${TABLE}
            WHERE "userId" = ${userId} AND "editorId" = ${ref.canvasId}
              AND "laneId" NOT IN (${Prisma.join(laneIds)})
          `);
        } else {
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM ${TABLE}
            WHERE "userId" = ${userId} AND "editorId" = ${ref.canvasId}
          `);
        }
      }
      for (const selection of selections) {
        if (!selection.loops.length) {
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM ${TABLE}
            WHERE "userId" = ${userId} AND "editorId" = ${ref.canvasId}
              AND "laneId" = ${selection.laneId}
          `);
          continue;
        }
        const loopsJson = JSON.stringify(selection.loops);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO ${TABLE}
            ("id", "userId", "editorId", "laneId", "loops", "createdAt", "updatedAt")
          VALUES
            (${randomUUID()}, ${userId}, ${ref.canvasId}, ${selection.laneId},
             ${loopsJson}::jsonb, NOW(), NOW())
          ON CONFLICT ("userId", "editorId", "laneId")
          DO UPDATE SET "loops" = EXCLUDED."loops", "updatedAt" = NOW()
        `);
      }
    });
    tableAvailability = "available";
  } catch (error) {
    handleError(error);
  }
};
