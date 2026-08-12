import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { prisma } from "../../../../../lib/prisma";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
const FEATURE_ENABLED = process.env.NEXT_PUBLIC_REAL_AUDIO_SYNC_ENABLED === "true";
const SAFE_STORAGE_HOST_SUFFIXES = [".storage.googleapis.com", ".storage.cloud.google.com"];

function isSafeStorageRedirect(location: string) {
  try {
    const url = new URL(location);
    return (
      url.protocol === "https:" &&
      (url.hostname === "storage.googleapis.com" ||
        SAFE_STORAGE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix)))
    );
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (!FEATURE_ENABLED) return res.status(404).json({ error: "Not found" });
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: "Not authenticated" });
  const editorId = Array.isArray(req.query.editor_id)
    ? req.query.editor_id[0]
    : req.query.editor_id;
  if (!editorId) return res.status(400).json({ error: "Invalid editor id" });

  const attachment = await prisma.gteAudioAttachment.findUnique({
    where: { userId_editorId: { userId: session.user.id, editorId } },
    select: { sourceJobId: true },
  });
  if (!attachment) return res.status(404).json({ error: "Source audio is not attached" });

  const headers: Record<string, string> = {
    ...(BACKEND_SECRET ? { "X-Backend-Secret": BACKEND_SECRET } : {}),
    "X-User-Id": session.user.id,
  };
  try {
    const upstream = await fetch(
      `${API_BASE}/api/v1/jobs/${encodeURIComponent(
        attachment.sourceJobId
      )}/artifacts/source_audio`,
      { headers, redirect: "manual", cache: "no-store" }
    );
    const location = upstream.headers.get("location");
    if (upstream.status !== 307 || !location || !isSafeStorageRedirect(location)) {
      return res.status(upstream.status === 410 ? 410 : 502).json({
        error: upstream.status === 410 ? "Source audio has expired" : "Source audio is unavailable",
      });
    }
    res.setHeader("Location", location);
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(307).end();
  } catch {
    return res.status(502).json({ error: "Source audio is unavailable" });
  }
}
