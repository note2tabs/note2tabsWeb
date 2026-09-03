import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type { CanvasSnapshot } from "../types/gte";
import { prisma } from "./prisma";

const LANE_DELIMITER = "__ed__";
const TABLE = Prisma.raw(`"GteEditorInputSetting"`);
const NOTE_SIZE_DENOMINATORS = new Set([0.5, 1, 2, 3, 4, 8, 16, 32, 64]);
const CURSOR_SIZE_DENOMINATORS = new Set([1, 2, 3, 4, 8, 16, 32, 64]);

export type GteEditorInputSettings = {
  defaultNoteLengthDenominator: number;
  cursorSizeDenominator: number;
};

type StoredSettings = GteEditorInputSettings;

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

const normalizeDenominator = (value: unknown, allowed: Set<number>, fallback: number) => {
  const parsed = Number(value);
  return allowed.has(parsed) ? parsed : fallback;
};

export const normalizeGteEditorInputSettings = (value: unknown): GteEditorInputSettings => {
  const source = isRecord(value) ? value : {};
  return {
    defaultNoteLengthDenominator: normalizeDenominator(
      source.defaultNoteLengthDenominator,
      NOTE_SIZE_DENOMINATORS,
      4
    ),
    cursorSizeDenominator: normalizeDenominator(source.cursorSizeDenominator, CURSOR_SIZE_DENOMINATORS, 4),
  };
};

const handleError = (error: unknown) => {
  const code = isRecord(error) && "code" in error ? String(error.code) : "";
  const message = isRecord(error) && "message" in error ? String(error.message) : "";
  if (code === "42P01" || /GteEditorInputSetting|does not exist/i.test(message)) {
    tableAvailability = "missing";
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn(
        "[gteEditorInputSettingsStore] Input settings table is missing. Run the Prisma migration."
      );
    }
    return;
  }
  console.warn("[gteEditorInputSettingsStore] Input settings persistence failed.", error);
};

export const getGteEditorInputSettings = async (userId: string, editorRef: string | null) => {
  if (!userId || !editorRef) return null;
  try {
    const editorId = editorIdFromRef(editorRef);
    const rows = await prisma.$queryRaw<StoredSettings[]>(Prisma.sql`
      SELECT "defaultNoteLengthDenominator", "cursorSizeDenominator"
      FROM ${TABLE}
      WHERE "userId" = ${userId} AND "editorId" = ${editorId}
      LIMIT 1
    `);
    tableAvailability = "available";
    return rows[0] ? normalizeGteEditorInputSettings(rows[0]) : null;
  } catch (error) {
    handleError(error);
    return null;
  }
};

export const saveGteEditorInputSettings = async (
  userId: string,
  editorRef: string | null,
  settings: unknown
) => {
  if (!userId || !editorRef) return null;
  const normalized = normalizeGteEditorInputSettings(settings);
  try {
    const editorId = editorIdFromRef(editorRef);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO ${TABLE}
        ("id", "userId", "editorId", "defaultNoteLengthDenominator", "cursorSizeDenominator", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${userId}, ${editorId}, ${normalized.defaultNoteLengthDenominator},
         ${normalized.cursorSizeDenominator}, NOW(), NOW())
      ON CONFLICT ("userId", "editorId")
      DO UPDATE SET
        "defaultNoteLengthDenominator" = EXCLUDED."defaultNoteLengthDenominator",
        "cursorSizeDenominator" = EXCLUDED."cursorSizeDenominator",
        "updatedAt" = NOW()
    `);
    tableAvailability = "available";
    return normalized;
  } catch (error) {
    handleError(error);
    return null;
  }
};

export const hydrateGteEditorInputSettingsFromStore = async <T>(
  userId: string,
  editorRef: string | null,
  payload: T
): Promise<T> => {
  if (!editorRef || !isRecord(payload)) return payload;
  const settings = await getGteEditorInputSettings(userId, editorRef);
  if (!settings) return payload;
  const apply = (value: unknown) => {
    if (isCanvas(value)) value.editorInputSettings = settings;
  };
  apply(payload);
  if ("canvas" in payload) apply(payload.canvas);
  if ("snapshot" in payload) apply(payload.snapshot);
  return payload;
};
