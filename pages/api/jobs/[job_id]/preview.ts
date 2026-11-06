import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { previewMetadata } from "../../../../lib/transcriptionPreviewProtocol";

const MAX_BYTES = 2_000_000;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: "Please sign in again." });
  const id = req.query.job_id;
  if (typeof id !== "string") return res.status(400).end();
  try {
    // Backend enforces ownership before returning any preview or storage URL.
    let response = await fetch(`${process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000"}/api/v1/jobs/${encodeURIComponent(id)}/artifacts/transcriptionPreview`, {
      headers: { "X-User-Id": session.user.id, "X-Backend-Secret": process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET || "" },
      signal: AbortSignal.timeout(15_000), cache: "no-store", redirect: "manual",
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || !location.startsWith("https://")) return res.status(502).end();
      // Do not forward internal authentication headers to the signed storage URL.
      response = await fetch(location, { signal: AbortSignal.timeout(15_000), cache: "no-store", redirect: "error" });
    }
    if (!response.ok) return res.status(response.status === 404 ? 404 : response.status === 403 ? 403 : 502).end();
    const reader = response.body?.getReader(); if (!reader) return res.status(502).end();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) { await reader.cancel(); return res.status(502).end(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!previewMetadata(payload) || !Array.isArray(payload.tracks)) return res.status(502).end();
    return res.status(200).json(payload);
  } catch { return res.status(502).json({ error: "Preview temporarily unavailable." }); }
}
