import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
import { prisma } from "./prisma";

const LANE_DELIMITER = "__ed__";
const TABLE = Prisma.raw(`"GteTrackPlaybackSetting"`);

type EditorRefParts = { canvasId: string; laneId: string | null };
type PlaybackSelection = {
  laneId: string;
  volume: number;
  muted: boolean;
  isolated: boolean;
};

let tableAvailability: "unknown" | "available" | "missing" = "unknown";
let missingTableLogged = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");
const isCanvas = (value: unknown): value is CanvasSnapshot =>
  isRecord(value) && Array.isArray((value as CanvasSnapshot).editors);
const isLane = (value: unknown): value is EditorSnapshot =>
  isRecord(value) && Array.isArray((value as EditorSnapshot).notes);
const clampVolume = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 1;
};
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
  const code = isRecord(error) && "code" in error ? String(error.code) : "";
  const message = isRecord(error) && "message" in error ? String(error.message) : "";
  if (code === "42P01" || /GteTrackPlaybackSetting|does not exist/i.test(message)) {
    tableAvailability = "missing";
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn(
        "[gteTrackPlaybackStore] Playback settings table is missing. Run the Prisma migration."
      );
    }
    return;
  }
  console.warn("[gteTrackPlaybackStore] Playback settings persistence failed.", error);
};

const selectionFromLane = (lane: EditorSnapshot): PlaybackSelection | null => {
  const laneId = typeof lane.id === "string" ? lane.id.trim() : "";
  if (!laneId) return null;
  return {
    laneId,
    volume: clampVolume(lane.playbackVolume),
    muted: lane.playbackMuted === true,
    isolated: lane.playbackIsolated === true,
  };
};

const collectSelections = (snapshot: unknown, ref: EditorRefParts) => {
  if (isCanvas(snapshot)) {
    return snapshot.editors
      .map(selectionFromLane)
      .filter((item): item is PlaybackSelection => Boolean(item));
  }
  if (isLane(snapshot) && ref.laneId) {
    const selection = selectionFromLane({ ...snapshot, id: ref.laneId });
    return selection ? [selection] : [];
  }
  return [];
};

const loadRows = async (userId: string, canvasId: string) => {
  if (!userId || !canvasId || tableAvailability === "missing") return [];
  try {
    const rows = await prisma.$queryRaw<PlaybackSelection[]>(Prisma.sql`
      SELECT "laneId", "volume", "muted", "isolated"
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

const applyRows = (value: unknown, laneId: string | null, rows: PlaybackSelection[]) => {
  const rowByLane = new Map(rows.map((row) => [row.laneId, row]));
  const applyLane = (lane: EditorSnapshot, id: string) => {
    const row = rowByLane.get(id);
    if (!row) return;
    lane.playbackVolume = clampVolume(row.volume);
    lane.playbackMuted = row.muted;
    lane.playbackIsolated = row.isolated;
  };
  if (isCanvas(value)) {
    value.editors.forEach((lane) => applyLane(lane, lane.id));
  } else if (isLane(value) && laneId) {
    applyLane(value, laneId);
  }
};

export const hydrateTrackPlaybackFromStore = async <T>(
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

export const persistTrackPlaybackFromSnapshot = async (
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
        const laneIds = selections.map((selection) => selection.laneId);
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
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO ${TABLE}
            ("id", "userId", "editorId", "laneId", "volume", "muted", "isolated", "createdAt", "updatedAt")
          VALUES
            (${randomUUID()}, ${userId}, ${ref.canvasId}, ${selection.laneId}, ${selection.volume},
             ${selection.muted}, ${selection.isolated}, NOW(), NOW())
          ON CONFLICT ("userId", "editorId", "laneId")
          DO UPDATE SET
            "volume" = EXCLUDED."volume",
            "muted" = EXCLUDED."muted",
            "isolated" = EXCLUDED."isolated",
            "updatedAt" = NOW()
        `);
      }
    });
    tableAvailability = "available";
  } catch (error) {
    handleError(error);
  }
};
