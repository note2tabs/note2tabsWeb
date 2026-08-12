import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "../../../../lib/prisma";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
const FEATURE_ENABLED = process.env.NEXT_PUBLIC_REAL_AUDIO_SYNC_ENABLED === "true";

type SourceAudioStatus = {
  jobId: string;
  status: "available" | "expired" | "unavailable" | "processing";
  jobStatus?: string | null;
  available: boolean;
  expiresAt?: string | null;
  contentType?: string | null;
  sourceType?: string | null;
  retentionPolicy?: string | null;
  reattachable: boolean;
  playbackOffsetSeconds: number;
  sourceClipStartSeconds: number;
  clipDurationSeconds: number;
  artifactPath?: string | null;
};

const backendHeaders = (userId: string) => ({
  ...(BACKEND_SECRET ? { "X-Backend-Secret": BACKEND_SECRET } : {}),
  "X-User-Id": userId,
});

function isSameOriginMutation(req: NextApiRequest) {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (!origin) return true;
  const rawHost = req.headers["x-forwarded-host"] || req.headers.host;
  const rawProtocol = req.headers["x-forwarded-proto"] || "https";
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  const protocol = Array.isArray(rawProtocol) ? rawProtocol[0] : rawProtocol;
  if (!host) return false;
  try {
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

async function assertOwnedEditor(userId: string, editorId: string) {
  const response = await fetch(`${API_BASE}/gte/editors/${encodeURIComponent(editorId)}`, {
    method: "GET",
    headers: backendHeaders(userId),
    cache: "no-store",
  });
  if (!response.ok) {
    throw Object.assign(new Error("Editor not found"), { status: 404 });
  }
}

async function backendStatus(userId: string, jobId: string) {
  const response = await fetch(
    `${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}/source-audio`,
    {
      method: "GET",
      headers: backendHeaders(userId),
      cache: "no-store",
    }
  );
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail?: unknown }).detail || "")
        : "";
    throw Object.assign(new Error(detail || "Source audio is unavailable."), {
      status: response.status,
    });
  }
  return payload as SourceAudioStatus;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (!FEATURE_ENABLED) return res.status(404).json({ error: "Not found" });
  if (!req.method || !["GET", "POST", "PUT", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: "Not authenticated" });
  const editorId = Array.isArray(req.query.editor_id)
    ? req.query.editor_id[0]
    : req.query.editor_id;
  if (!editorId || editorId.length > 160) {
    return res.status(400).json({ error: "Invalid editor id" });
  }

  try {
    if (req.method === "DELETE") {
      await prisma.gteAudioAttachment.deleteMany({
        where: { userId: session.user.id, editorId },
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === "PUT") {
      await assertOwnedEditor(session.user.id, editorId);
      const sourceJobId =
        typeof req.body?.sourceJobId === "string" ? req.body.sourceJobId.trim() : "";
      const clipOffsetSeconds = Number(req.body?.clipOffsetSeconds ?? 0);
      const timelineOffsetFrames = Number(req.body?.timelineOffsetFrames ?? 0);
      if (
        !sourceJobId ||
        sourceJobId.length > 160 ||
        !Number.isFinite(clipOffsetSeconds) ||
        !Number.isFinite(timelineOffsetFrames)
      ) {
        return res.status(400).json({ error: "Invalid source audio attachment" });
      }
      // Ownership is proven by the backend status route before a durable
      // association is written. Cross-account job IDs are indistinguishable
      // from unknown IDs there.
      const status = await backendStatus(session.user.id, sourceJobId);
      const attachment = await prisma.gteAudioAttachment.upsert({
        where: { userId_editorId: { userId: session.user.id, editorId } },
        create: {
          userId: session.user.id,
          editorId,
          sourceJobId,
          timelineOffsetFrames: Math.max(0, Math.min(100_000_000, Math.round(timelineOffsetFrames))),
          clipOffsetSeconds: Math.max(-86_400, Math.min(86_400, clipOffsetSeconds)),
        },
        update: {
          sourceJobId,
          timelineOffsetFrames: Math.max(0, Math.min(100_000_000, Math.round(timelineOffsetFrames))),
          clipOffsetSeconds: Math.max(-86_400, Math.min(86_400, clipOffsetSeconds)),
        },
        select: { sourceJobId: true, timelineOffsetFrames: true, clipOffsetSeconds: true },
      });
      return res.status(200).json({ attachment, source: status });
    }

    if (req.method === "POST") {
      if (!isSameOriginMutation(req)) {
        return res.status(403).json({ error: "Cross-site request rejected" });
      }
      await assertOwnedEditor(session.user.id, editorId);
      const existing = await prisma.gteAudioAttachment.findUnique({
        where: { userId_editorId: { userId: session.user.id, editorId } },
        select: { sourceJobId: true, timelineOffsetFrames: true, clipOffsetSeconds: true },
      });
      const isReattach = req.body?.action === "reattach";
      let response: Response;
      if (isReattach) {
        if (!existing) return res.status(404).json({ error: "Source audio is not attached" });
        response = await fetch(
          `${API_BASE}/api/v1/jobs/${encodeURIComponent(existing.sourceJobId)}/source-audio/reattach`,
          {
            method: "POST",
            headers: backendHeaders(session.user.id),
            cache: "no-store",
          }
        );
      } else {
        const youtubeUrl = typeof req.body?.youtubeUrl === "string" ? req.body.youtubeUrl.trim() : "";
        if (!youtubeUrl || youtubeUrl.length > 2048) {
          return res.status(400).json({ error: "Enter a valid YouTube video URL" });
        }
        response = await fetch(`${API_BASE}/api/v1/source-audio`, {
          method: "POST",
          headers: { ...backendHeaders(session.user.id), "Content-Type": "application/json" },
          body: JSON.stringify({
            youtubeUrl,
            startTime: Number(req.body?.startTime || 0),
            duration: Number(req.body?.duration || 600),
          }),
          cache: "no-store",
        });
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw Object.assign(
          new Error(typeof payload?.detail === "string" ? payload.detail : "Source audio could not be prepared."),
          { status: response.status }
        );
      }
      const sourceJobId = String(payload?.jobId || payload?.job_id || "").trim();
      if (!sourceJobId) throw new Error("Source audio job was not created");
      const timelineOffsetFrames = isReattach
        ? Number(existing?.timelineOffsetFrames || 0)
        : Math.max(0, Math.min(100_000_000, Math.round(Number(req.body?.timelineOffsetFrames) || 0)));
      const attachment = await prisma.gteAudioAttachment.upsert({
        where: { userId_editorId: { userId: session.user.id, editorId } },
        create: {
          userId: session.user.id,
          editorId,
          sourceJobId,
          timelineOffsetFrames,
          clipOffsetSeconds: Number(existing?.clipOffsetSeconds || 0),
        },
        update: { sourceJobId, timelineOffsetFrames },
        select: { sourceJobId: true, timelineOffsetFrames: true, clipOffsetSeconds: true },
      });
      return res.status(202).json({
        attachment,
        source: {
          jobId: sourceJobId,
          status: "processing",
          jobStatus: String(payload?.status || "queued"),
          available: false,
          reattachable: true,
          playbackOffsetSeconds: 0,
          sourceClipStartSeconds: 0,
          clipDurationSeconds: Number(req.body?.duration || 600),
        },
      });
    }

    const attachment = await prisma.gteAudioAttachment.findUnique({
      where: { userId_editorId: { userId: session.user.id, editorId } },
      select: { sourceJobId: true, timelineOffsetFrames: true, clipOffsetSeconds: true },
    });
    if (!attachment) return res.status(200).json({ attachment: null, source: null });
    const status = await backendStatus(session.user.id, attachment.sourceJobId);
    return res.status(200).json({ attachment, source: status });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 502;
    const safeStatus = [400, 403, 404, 409, 410, 429, 503].includes(status) ? status : 502;
    return res.status(safeStatus).json({
      error: error instanceof Error ? error.message : "Source audio is unavailable.",
    });
  }
}
