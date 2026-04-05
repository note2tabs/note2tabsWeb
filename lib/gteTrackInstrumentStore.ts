import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
import { prisma } from "./prisma";

const LANE_DELIMITER = "__ed__";
const DEFAULT_TRACK_INSTRUMENT_ID = "builtin:sine";
const GTE_TRACK_INSTRUMENT_TABLE = Prisma.raw(`"GteTrackInstrument"`);

type EditorRefParts = {
  canvasId: string;
  laneId: string | null;
};

type InstrumentSelection = {
  laneId: string;
  instrumentId: string | null;
};

type TrackInstrumentRow = {
  laneId: string;
  instrumentId: string;
};

let tableAvailability: "unknown" | "available" | "missing" = "unknown";
let missingTableLogged = false;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

const isCanvasSnapshot = (value: unknown): value is CanvasSnapshot =>
  isObjectRecord(value) && Array.isArray((value as CanvasSnapshot).editors);

const isEditorSnapshot = (value: unknown): value is EditorSnapshot =>
  isObjectRecord(value) &&
  Array.isArray((value as EditorSnapshot).notes) &&
  Array.isArray((value as EditorSnapshot).chords);

const normalizeInstrumentId = (value: unknown) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || DEFAULT_TRACK_INSTRUMENT_ID;
};

const toStoredInstrumentId = (value: unknown) => {
  const normalized = normalizeInstrumentId(value);
  return normalized === DEFAULT_TRACK_INSTRUMENT_ID ? null : normalized;
};

const isMissingTableError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as any).code) : "";
  const message =
    typeof error === "object" && error && "message" in error ? String((error as any).message) : "";
  return code === "42P01" || /GteTrackInstrument/i.test(message) || /does not exist/i.test(message);
};

const handleStoreError = (error: unknown) => {
  if (isMissingTableError(error)) {
    tableAvailability = "missing";
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn(
        "[gteTrackInstrumentStore] GteTrackInstrument table is missing. Run the Prisma migration to enable instrument persistence."
      );
    }
    return;
  }
  console.warn("[gteTrackInstrumentStore] Track instrument persistence failed.", error);
};

const parseEditorRef = (editorRef: string): EditorRefParts => {
  const splitIndex = editorRef.indexOf(LANE_DELIMITER);
  if (splitIndex < 0) {
    return { canvasId: editorRef, laneId: null };
  }
  return {
    canvasId: editorRef.slice(0, splitIndex),
    laneId: editorRef.slice(splitIndex + LANE_DELIMITER.length) || null,
  };
};

const getEditorRefFromPath = (path: string) => {
  const match = path.match(/^editors\/([^/]+)/);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
};

const applyInstrumentIdToLane = (lane: Record<string, unknown>, instrumentMap: Map<string, string>) => {
  const laneId = typeof lane.id === "string" ? lane.id : "";
  if (!laneId) return;
  const savedInstrumentId = instrumentMap.get(laneId);
  if (savedInstrumentId) {
    lane.instrumentId = savedInstrumentId;
  }
};

const collectSelectionsFromSnapshot = (
  snapshot: unknown,
  editorRef: EditorRefParts
): InstrumentSelection[] => {
  if (isCanvasSnapshot(snapshot)) {
    return snapshot.editors
      .map((lane) => {
        const laneId = typeof lane.id === "string" ? lane.id.trim() : "";
        if (!laneId) return null;
        return {
          laneId,
          instrumentId: toStoredInstrumentId(lane.instrumentId),
        } satisfies InstrumentSelection;
      })
      .filter((entry): entry is InstrumentSelection => Boolean(entry));
  }

  if (isEditorSnapshot(snapshot) && editorRef.laneId) {
    return [
      {
        laneId: editorRef.laneId,
        instrumentId: toStoredInstrumentId(snapshot.instrumentId),
      },
    ];
  }

  return [];
};

const loadTrackInstrumentMap = async (userId: string, canvasId: string) => {
  if (!userId || !canvasId || tableAvailability === "missing") {
    return new Map<string, string>();
  }
  try {
    const rows = await prisma.$queryRaw<TrackInstrumentRow[]>(Prisma.sql`
      SELECT "laneId", "instrumentId"
      FROM ${GTE_TRACK_INSTRUMENT_TABLE}
      WHERE "userId" = ${userId} AND "editorId" = ${canvasId}
    `);
    tableAvailability = "available";
    return new Map(rows.map((row) => [row.laneId, row.instrumentId]));
  } catch (error) {
    handleStoreError(error);
    return new Map<string, string>();
  }
};

const saveTrackInstrumentSelections = async (
  userId: string,
  canvasId: string,
  selections: InstrumentSelection[],
  options?: { replaceCanvas?: boolean }
) => {
  if (!userId || !canvasId || tableAvailability === "missing") return;
  try {
    await prisma.$transaction(async (tx) => {
      if (options?.replaceCanvas) {
        const laneIds = selections.map((selection) => selection.laneId);
        if (laneIds.length) {
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM ${GTE_TRACK_INSTRUMENT_TABLE}
            WHERE "userId" = ${userId}
              AND "editorId" = ${canvasId}
              AND "laneId" NOT IN (${Prisma.join(laneIds)})
          `);
        } else {
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM ${GTE_TRACK_INSTRUMENT_TABLE}
            WHERE "userId" = ${userId} AND "editorId" = ${canvasId}
          `);
        }
      }

      for (const selection of selections) {
        if (!selection.instrumentId) {
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM ${GTE_TRACK_INSTRUMENT_TABLE}
            WHERE "userId" = ${userId}
              AND "editorId" = ${canvasId}
              AND "laneId" = ${selection.laneId}
          `);
          continue;
        }

        await tx.$executeRaw(Prisma.sql`
          INSERT INTO ${GTE_TRACK_INSTRUMENT_TABLE}
            ("id", "userId", "editorId", "laneId", "instrumentId", "createdAt", "updatedAt")
          VALUES
            (${randomUUID()}, ${userId}, ${canvasId}, ${selection.laneId}, ${selection.instrumentId}, NOW(), NOW())
          ON CONFLICT ("userId", "editorId", "laneId")
          DO UPDATE SET
            "instrumentId" = EXCLUDED."instrumentId",
            "updatedAt" = NOW()
        `);
      }
    });
    tableAvailability = "available";
  } catch (error) {
    handleStoreError(error);
  }
};

export const getGteEditorRefFromPath = (path: string) => getEditorRefFromPath(path);

export const hydrateTrackInstrumentsFromStore = async <T>(
  userId: string,
  editorRef: string | null,
  payload: T
): Promise<T> => {
  if (!editorRef || tableAvailability === "missing" || !isObjectRecord(payload)) {
    return payload;
  }

  const { canvasId, laneId } = parseEditorRef(editorRef);
  const instrumentMap = await loadTrackInstrumentMap(userId, canvasId);
  if (!instrumentMap.size) return payload;

  const mergeValue = (value: unknown) => {
    if (isCanvasSnapshot(value)) {
      value.editors.forEach((lane) => applyInstrumentIdToLane(lane as Record<string, unknown>, instrumentMap));
      return;
    }
    if (isEditorSnapshot(value) && laneId) {
      const savedInstrumentId = instrumentMap.get(laneId);
      if (savedInstrumentId) {
        (value as Record<string, unknown>).instrumentId = savedInstrumentId;
      }
    }
  };

  mergeValue(payload);
  if ("canvas" in payload) mergeValue((payload as Record<string, unknown>).canvas);
  if ("snapshot" in payload) mergeValue((payload as Record<string, unknown>).snapshot);
  return payload;
};

export const persistTrackInstrumentsFromSnapshot = async (
  userId: string,
  editorRef: string | null,
  snapshot: unknown
) => {
  if (!editorRef) return;
  const parsedRef = parseEditorRef(editorRef);
  const selections = collectSelectionsFromSnapshot(snapshot, parsedRef);
  if (!selections.length && !isCanvasSnapshot(snapshot)) return;
  await saveTrackInstrumentSelections(userId, parsedRef.canvasId, selections, {
    replaceCanvas: isCanvasSnapshot(snapshot),
  });
};

export const persistTrackInstrumentSelection = async (input: {
  userId: string;
  editorId: string;
  laneId: string;
  instrumentId?: string | null;
}) => {
  await saveTrackInstrumentSelections(
    input.userId,
    input.editorId,
    [
      {
        laneId: input.laneId,
        instrumentId: toStoredInstrumentId(input.instrumentId),
      },
    ],
    { replaceCanvas: false }
  );
};
