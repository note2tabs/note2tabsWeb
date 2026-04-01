import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
const MAX_ERROR_MESSAGE_LENGTH = 2000;

async function readUpstreamError(upstream: Response): Promise<string> {
  const text = (await upstream.text()).trim();
  if (!text) {
    return `Finalize request failed with status ${upstream.status}.`;
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
  } catch {
    // Fall through to raw text if upstream did not return JSON.
  }

  return text.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jobId = Array.isArray(req.query.job_id) ? req.query.job_id[0] : req.query.job_id;
  if (!jobId) {
    return res.status(400).json({ error: "Missing job id" });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.id) headers["X-User-Id"] = session.user.id;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}/finalize`, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body || {}),
    });
  } catch {
    return res.status(502).json({ error: "Unable to reach transcription backend." });
  }

  if (upstream.ok) {
    return res.status(200).json({ ok: true });
  }

  return res.status(upstream.status).json({ error: await readUpstreamError(upstream) });
}
