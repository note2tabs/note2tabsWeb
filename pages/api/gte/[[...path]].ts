import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import {
  getGteEditorRefFromPath,
  hydrateTrackInstrumentsFromStore,
  persistTrackInstrumentsFromSnapshot,
} from "../../../lib/gteTrackInstrumentStore";
import type { GteAnalyticsEvent } from "../../../lib/gteAnalytics";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
const SNAPSHOT_SAVE_CACHE_TTL_MS = 4000;
const SNAPSHOT_SAVE_CACHE_MAX = 200;

type SnapshotSaveCacheEntry = {
  body: string;
  status: number;
  text: string;
  contentType?: string;
  updatedAtMs: number;
};

const snapshotSaveCache = new Map<string, SnapshotSaveCacheEntry>();

function shouldLogTransferMetrics() {
  return process.env.NOTE2TABS_TRANSFER_LOGS === "true";
}

function logGteTransferMetric(metric: {
  method: string;
  path: string;
  upstreamStatus: number;
  responseBytes: number;
  durationMs: number;
  cacheHit?: boolean;
}) {
  if (!shouldLogTransferMetrics()) return;
  console.info("note2tabs.transfer.gte_proxy", {
    route: "/api/gte/[...path]",
    method: metric.method,
    path: metric.path,
    upstreamStatus: metric.upstreamStatus,
    responseBytes: metric.responseBytes,
    durationMs: metric.durationMs,
    cacheHit: Boolean(metric.cacheHit),
  });
}

type UpstreamImportBody = {
  ok?: boolean;
  target?: string;
  editorId?: string;
  importedEditorIds?: string[];
};

type GteEditorListItem = {
  id?: string;
  name?: string;
};

type GteEditorListResponse = {
  editors?: GteEditorListItem[];
};

const AUTO_NAME_SUFFIX_RE = /^(.*?)(\d{2,})$/;

function normalizeEditorName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "Untitled";
}

function editorNameKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function buildUniqueEditorName(
  requestedName: unknown,
  editors: GteEditorListItem[],
  excludedEditorId?: string
) {
  const desiredName = normalizeEditorName(requestedName);
  const existingNames = new Set(
    editors
      .filter((editor) => !excludedEditorId || editor.id !== excludedEditorId)
      .map((editor) => editorNameKey(normalizeEditorName(editor.name)))
  );

  if (!existingNames.has(editorNameKey(desiredName))) {
    return desiredName;
  }

  const suffixMatch = desiredName.match(AUTO_NAME_SUFFIX_RE);
  const baseName = suffixMatch && suffixMatch[1] ? suffixMatch[1] : desiredName;
  let suffixNumber = suffixMatch ? Math.max(2, Number.parseInt(suffixMatch[2], 10) + 1) : 2;
  let candidate = `${baseName}${String(suffixNumber).padStart(2, "0")}`;

  while (existingNames.has(editorNameKey(candidate))) {
    suffixNumber += 1;
    candidate = `${baseName}${String(suffixNumber).padStart(2, "0")}`;
  }

  return candidate;
}

async function getExistingEditors(headers: Record<string, string>) {
  const response = await fetch(`${API_BASE}/gte/editors`, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(`Could not load existing editors (${response.status})`);
  }
  const data = (await response.json()) as GteEditorListResponse;
  return Array.isArray(data.editors) ? data.editors : [];
}

async function withUniqueEditorName(input: {
  body: unknown;
  headers: Record<string, string>;
  excludedEditorId?: string;
}) {
  const body = input.body && typeof input.body === "object" ? { ...(input.body as Record<string, unknown>) } : {};
  const editors = await getExistingEditors(input.headers);
  body.name = buildUniqueEditorName(body.name, editors, input.excludedEditorId);
  return body;
}

function getRequestedImportTarget(req: NextApiRequest): string {
  return typeof (req.body as { target?: unknown } | undefined)?.target === "string"
    ? String((req.body as { target?: string }).target).trim().toLowerCase()
    : "";
}

function getRequestedImportEditorId(req: NextApiRequest): string | undefined {
  const raw = (req.body as { editorId?: unknown } | undefined)?.editorId;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function getPath(req: NextApiRequest) {
  return Array.isArray(req.query.path) ? req.query.path.join("/") : "";
}

function isSnapshotSaveRequest(method: string, path: string) {
  return method === "POST" && /(^|\/)editors\/[^/]+\/snapshot$/.test(path);
}

function getRenameEditorId(method: string, path: string) {
  if (method !== "POST") return undefined;
  const match = path.match(/^editors\/([^/]+)\/name$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function classifyEditorAction(method: string, path: string) {
  if (method !== "POST" && method !== "DELETE" && method !== "PATCH") return null;
  if (/^editors\/[^/]+\/snapshot$/.test(path)) return "snapshot_saved";
  if (/^editors\/[^/]+\/name$/.test(path)) return "renamed";
  if (/^editors\/[^/]+\/bars\//.test(path)) return "bars_changed";
  if (/^editors\/[^/]+\/notes/.test(path)) return "notes_changed";
  if (/^editors\/[^/]+\/chords/.test(path)) return "chords_changed";
  if (/^editors\/[^/]+\/optimals\//.test(path)) return "optimals_assigned";
  if (/^editors\/[^/]+\/cuts\//.test(path)) return "cuts_changed";
  if (/^editors\/[^/]+\/import/.test(path)) return "tab_imported";
  return null;
}

function snapshotCounts(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return {};
  const record = snapshot as Record<string, unknown>;
  const lanes = Array.isArray(record.editors) ? record.editors : [record];
  let noteCount = 0;
  let chordCount = 0;
  for (const lane of lanes) {
    if (!lane || typeof lane !== "object") continue;
    const laneRecord = lane as Record<string, unknown>;
    noteCount += Array.isArray(laneRecord.notes) ? laneRecord.notes.length : 0;
    chordCount += Array.isArray(laneRecord.chords) ? laneRecord.chords.length : 0;
  }
  return {
    laneCount: lanes.length,
    noteCount,
    chordCount,
  };
}

function pruneSnapshotSaveCache() {
  if (snapshotSaveCache.size <= SNAPSHOT_SAVE_CACHE_MAX) return;
  const entries = Array.from(snapshotSaveCache.entries()).sort(
    (a, b) => a[1].updatedAtMs - b[1].updatedAtMs
  );
  const toDelete = entries.slice(0, entries.length - SNAPSHOT_SAVE_CACHE_MAX);
  toDelete.forEach(([key]) => snapshotSaveCache.delete(key));
}

function buildUrl(req: NextApiRequest) {
  const path = getPath(req);
  const url = new URL(`${API_BASE}/gte/${path}`);
  Object.entries(req.query).forEach(([key, value]) => {
    if (key === "path") return;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else if (typeof value === "string") {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
}

async function maybeLogGteAnalyticsEvent(input: {
  userId: string;
  event: GteAnalyticsEvent;
  path: string;
  payload: Record<string, unknown>;
  req: NextApiRequest;
  res: NextApiResponse;
}) {
  try {
    const analytics = await import("../../../lib/gteAnalytics");
    await analytics.logGteAnalyticsEvent(input);
  } catch {
    // Keep the GTE proxy independent from analytics/Prisma failures.
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestStartedAt = Date.now();
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const url = buildUrl(req);
  const headers: Record<string, string> = {
    "X-User-Id": session.user.id,
  };
  if (BACKEND_SECRET) {
    headers["X-Backend-Secret"] = BACKEND_SECRET;
  }

  const method = req.method || "GET";
  const path = getPath(req);
  const editorRef = getGteEditorRefFromPath(path);
  const isSnapshotSave = isSnapshotSaveRequest(method, path);
  const isTranscriberImport = method === "POST" && path === "transcriber/import";
  const cacheKey = `${session.user.id}:${path}`;
  let body: string | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    headers["Content-Type"] = "application/json";
    let requestBody = req.body ?? {};
    const renameEditorId = getRenameEditorId(method, path);
    const importTarget = isTranscriberImport ? getRequestedImportTarget(req) : "";
    const importEditorId = isTranscriberImport ? getRequestedImportEditorId(req) : undefined;
    const shouldUniquifyName =
      (method === "POST" && path === "editors") ||
      Boolean(renameEditorId) ||
      (isTranscriberImport && !importEditorId && (!importTarget || importTarget === "new"));

    if (shouldUniquifyName) {
      try {
        requestBody = await withUniqueEditorName({
          body: requestBody,
          headers,
          excludedEditorId: renameEditorId,
        });
      } catch (error: any) {
        return res.status(502).json({
          error: "Could not validate editor name",
          detail: error?.message || "editor_name_validation_failed",
        });
      }
    }

    body = JSON.stringify(requestBody);
  }

  if (isSnapshotSave && body) {
    const cached = snapshotSaveCache.get(cacheKey);
    if (cached && cached.body === body && Date.now() - cached.updatedAtMs < SNAPSHOT_SAVE_CACHE_TTL_MS) {
      res.status(cached.status);
      if (cached.contentType) {
        res.setHeader("Content-Type", cached.contentType);
      }
      if (!cached.text) {
        logGteTransferMetric({
          method,
          path,
          upstreamStatus: cached.status,
          responseBytes: 0,
          durationMs: Date.now() - requestStartedAt,
          cacheHit: true,
        });
        return res.end();
      }
      logGteTransferMetric({
        method,
        path,
        upstreamStatus: cached.status,
        responseBytes: Buffer.byteLength(cached.text, "utf-8"),
        durationMs: Date.now() - requestStartedAt,
        cacheHit: true,
      });
      return res.send(cached.text);
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body,
    });
  } catch (error: any) {
    return res.status(502).json({
      error: "GTE upstream request failed",
      detail: error?.message || "fetch_failed",
      path,
      method,
    });
  }
  if (isTranscriberImport && upstream.ok) {
    const requestedEditorId = getRequestedImportEditorId(req);
    if (requestedEditorId) {
      const target = getRequestedImportTarget(req) || "existing";
      try {
        await upstream.body?.cancel?.();
      } catch {
        // noop
      }
      res.status(upstream.status);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const responseText = JSON.stringify({
        ok: true,
        target,
        editorId: requestedEditorId,
      } satisfies UpstreamImportBody);
      logGteTransferMetric({
        method,
        path,
        upstreamStatus: upstream.status,
        responseBytes: Buffer.byteLength(responseText, "utf-8"),
        durationMs: Date.now() - requestStartedAt,
      });
      return res.send(responseText);
    }
  }
  const text = await upstream.text();
  let responseText = text;
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
  if (upstream.ok && isSnapshotSave) {
    await persistTrackInstrumentsFromSnapshot(
      session.user.id,
      editorRef,
      (req.body as { snapshot?: unknown } | undefined)?.snapshot
    );
  }

  if (upstream.ok && editorRef && responseText) {
    try {
      const parsed = JSON.parse(responseText) as unknown;
      const hydrated = await hydrateTrackInstrumentsFromStore(session.user.id, editorRef, parsed);
      responseText = JSON.stringify(hydrated);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    } catch {
      // Keep proxy responses untouched when upstream did not return JSON.
    }
  }

  if (isSnapshotSave && body && upstream.ok) {
    snapshotSaveCache.set(cacheKey, {
      body,
      status: upstream.status,
      text: responseText,
      contentType: "application/json; charset=utf-8",
      updatedAtMs: Date.now(),
    });
    pruneSnapshotSaveCache();
  }
  if (upstream.ok && method === "POST" && path === "editors") {
    try {
      const parsed = text ? (JSON.parse(text) as { editorId?: string }) : {};
      const editorId = typeof parsed.editorId === "string" ? parsed.editorId : undefined;
      if (editorId) {
        await maybeLogGteAnalyticsEvent({
          userId: session.user.id,
          event: "gte_editor_created",
          path: "/api/gte/editors",
          payload: { editorId, source: "gte_proxy" },
          req,
          res,
        });
      }
    } catch {
      // ignore analytics parse/logging failures
    }
  }
  const commitMatch = method === "POST" ? path.match(/^editors\/([^/]+)\/commit$/) : null;
  if (upstream.ok && commitMatch) {
    await maybeLogGteAnalyticsEvent({
      userId: session.user.id,
      event: "gte_editor_saved",
      path: `/api/gte/${path}`,
      payload: { editorId: decodeURIComponent(commitMatch[1]), source: "gte_commit" },
      req,
      res,
    });
  }
  const editorAction = editorRef ? classifyEditorAction(method, path) : null;
  if (upstream.ok && editorRef && editorAction) {
    await maybeLogGteAnalyticsEvent({
      userId: session.user.id,
      event: "gte_editor_action",
      path: `/api/gte/${path}`,
      payload: {
        editorId: editorRef,
        action: editorAction,
        ...snapshotCounts((req.body as { snapshot?: unknown } | undefined)?.snapshot),
      },
      req,
      res,
    });
  }
  const exportMatch = method === "GET" ? path.match(/^editors\/([^/]+)\/(export|export_ascii)$/) : null;
  if (upstream.ok && exportMatch) {
    await maybeLogGteAnalyticsEvent({
      userId: session.user.id,
      event: "gte_editor_exported",
      path: `/api/gte/${path}`,
      payload: {
        editorId: decodeURIComponent(exportMatch[1]),
        format: exportMatch[2] === "export_ascii" ? "ascii" : "structured",
        source: "gte_export",
      },
      req,
      res,
    });
  }
  if (upstream.ok && isTranscriberImport) {
    try {
      const target = getRequestedImportTarget(req);
      const shouldLogCreate = !target || target === "new";
      const parsed = text ? (JSON.parse(text) as UpstreamImportBody) : {};
      const editorId = typeof parsed.editorId === "string" ? parsed.editorId : undefined;
      if (shouldLogCreate && editorId) {
        await maybeLogGteAnalyticsEvent({
          userId: session.user.id,
          event: "gte_editor_created",
          path: "/api/gte/transcriber/import",
          payload: { editorId, source: "gte_transcriber_import" },
          req,
          res,
        });
      }
      if (editorId) {
        await maybeLogGteAnalyticsEvent({
          userId: session.user.id,
          event: "gte_editor_imported",
          path: "/api/gte/transcriber/import",
          payload: { editorId, target: target || "new", source: "gte_transcriber_import" },
          req,
          res,
        });
      }
      if (editorId) {
        responseText = JSON.stringify({
          ok: parsed.ok !== false,
          target: typeof parsed.target === "string" ? parsed.target : target || undefined,
          editorId,
          importedEditorIds: Array.isArray(parsed.importedEditorIds) ? parsed.importedEditorIds : undefined,
        } satisfies UpstreamImportBody);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
    } catch {
      // ignore analytics parse/logging failures
    }
  }
  if (!responseText) {
    logGteTransferMetric({
      method,
      path,
      upstreamStatus: upstream.status,
      responseBytes: 0,
      durationMs: Date.now() - requestStartedAt,
    });
    return res.end();
  }
  logGteTransferMetric({
    method,
    path,
    upstreamStatus: upstream.status,
    responseBytes: Buffer.byteLength(responseText, "utf-8"),
    durationMs: Date.now() - requestStartedAt,
  });
  return res.send(responseText);
}
