import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { logGteAnalyticsEvent } from "../../../lib/gteAnalytics";

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

function getPath(req: NextApiRequest) {
  return Array.isArray(req.query.path) ? req.query.path.join("/") : "";
}

function isSnapshotSaveRequest(method: string, path: string) {
  return method === "POST" && /(^|\/)editors\/[^/]+\/snapshot$/.test(path);
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  const isSnapshotSave = isSnapshotSaveRequest(method, path);
  const cacheKey = `${session.user.id}:${path}`;
  let body: string | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.body ?? {});
  }

  if (isSnapshotSave && body) {
    const cached = snapshotSaveCache.get(cacheKey);
    if (cached && cached.body === body && Date.now() - cached.updatedAtMs < SNAPSHOT_SAVE_CACHE_TTL_MS) {
      res.status(cached.status);
      if (cached.contentType) {
        res.setHeader("Content-Type", cached.contentType);
      }
      if (!cached.text) {
        return res.end();
      }
      return res.send(cached.text);
    }
  }

  const upstream = await fetch(url, {
    method,
    headers,
    body,
  });
  const text = await upstream.text();
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
  if (isSnapshotSave && body && upstream.ok) {
    snapshotSaveCache.set(cacheKey, {
      body,
      status: upstream.status,
      text,
      contentType: contentType || undefined,
      updatedAtMs: Date.now(),
    });
    pruneSnapshotSaveCache();
  }
  if (upstream.ok && method === "POST" && path === "editors") {
    try {
      const parsed = text ? (JSON.parse(text) as { editorId?: string }) : {};
      const editorId = typeof parsed.editorId === "string" ? parsed.editorId : undefined;
      if (editorId) {
        await logGteAnalyticsEvent({
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
  if (!text) {
    return res.end();
  }
  return res.send(text);
}
