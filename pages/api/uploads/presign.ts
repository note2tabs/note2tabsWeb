import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

const MAX_FREE_BYTES = 50 * 1024 * 1024;
const MAX_PREMIUM_BYTES = 500 * 1024 * 1024;

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET = process.env.NOTE2TABS_BACKEND_SECRET;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { fileName, contentType, size } = req.body || {};
  const sizeNum = typeof size === "number" ? size : Number(size);
  if (typeof fileName !== "string" || !Number.isFinite(sizeNum) || sizeNum <= 0) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const role = session.user.role || "FREE";
  const isPremium = role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";
  const maxBytes = isPremium ? MAX_PREMIUM_BYTES : MAX_FREE_BYTES;
  if (sizeNum > maxBytes) {
    return res.status(413).json({ error: "File too large", maxBytes });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-User-Id": session.user.id,
  };
  if (BACKEND_SECRET) {
    headers["X-Backend-Secret"] = BACKEND_SECRET;
  }

  const upstream = await fetch(`${API_BASE}/uploads/presign`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fileName,
      contentType: typeof contentType === "string" ? contentType : "application/octet-stream",
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: data?.error || "Could not prepare upload." });
  }
  if (!data?.url || !data?.key) {
    return res.status(502).json({ error: "Invalid presign response." });
  }
  return res.status(200).json({ url: data.url, key: data.key, maxBytes });
}
