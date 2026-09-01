import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type { CanvasSnapshot } from "../types/gte";
import { prisma } from "./prisma";

const LANE_DELIMITER = "__ed__";
const TABLE = Prisma.raw(`"GteActiveLane"`);

type StoredActiveLane = { laneId: string };

let tableAvailability: "unknown" | "available" | "missing" = "unknown";
let missingTableLogged = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

const isCanvas = (value: unknown): value is CanvasSnapshot =>
  isRecord(value) && Array.isArray((value as CanvasSnapshot).editors);

const editorIdFromRef = (editorRef: string) => {
  const delimiterIndex = editorRef.indexOf(LANE_DELIMITER);
  return delimiterIndex < 0 ? editorRef : editorRef.slice(0, delimiterIndex);
};

const handleError = (error: unknown) => {
  const code = isRecord(error) && "code" in error ? String(error.code) : "";
  const message = isRecord(error) && "message" in error ? String(error.message) : "";
  if (code === "42P01" || /GteActiveLane|does not exist/i.test(message)) {
    tableAvailability = "missing";
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn("[gteActiveLaneStore] Active lane table is missing. Run the Prisma migration.");
    }
    return;
  }
  console.warn("[gteActiveLaneStore] Active lane persistence failed.", error);
};

export const getGteActiveLane = async (userId: string, editorRef: string | null) => {
  if (!userId || !editorRef) return null;
  try {
    const editorId = editorIdFromRef(editorRef);
    const rows = await prisma.$queryRaw<StoredActiveLane[]>(Prisma.sql`
      SELECT "laneId"
      FROM ${TABLE}
      WHERE "userId" = ${userId} AND "editorId" = ${editorId}
      LIMIT 1
    `);
    tableAvailability = "available";
    return rows[0]?.laneId || null;
  } catch (error) {
    handleError(error);
    return null;
  }
};

export const saveGteActiveLane = async (
  userId: string,
  editorRef: string | null,
  laneId: unknown
) => {
  if (!userId || !editorRef || typeof laneId !== "string" || !laneId.trim()) return null;
  const normalized = laneId.trim();
  try {
    const editorId = editorIdFromRef(editorRef);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO ${TABLE}
        ("id", "userId", "editorId", "laneId", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${userId}, ${editorId}, ${normalized}, NOW(), NOW())
      ON CONFLICT ("userId", "editorId")
      DO UPDATE SET
        "laneId" = EXCLUDED."laneId",
        "updatedAt" = NOW()
    `);
    tableAvailability = "available";
    return normalized;
  } catch (error) {
    handleError(error);
    return null;
  }
};

export const hydrateGteActiveLaneFromStore = async <T>(
  userId: string,
  editorRef: string | null,
  payload: T
): Promise<T> => {
  if (!editorRef || !isRecord(payload)) return payload;
  const laneId = await getGteActiveLane(userId, editorRef);
  if (!laneId) return payload;
  const apply = (value: unknown) => {
    if (isCanvas(value)) value.activeLaneId = laneId;
  };
  apply(payload);
  if ("canvas" in payload) apply(payload.canvas);
  if ("snapshot" in payload) apply(payload.snapshot);
  return payload;
};
