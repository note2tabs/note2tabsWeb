import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
const MAX_ERROR_MESSAGE_LENGTH = 2000;

function readUpstreamError(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return `Redo request failed with status ${status}.`;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
  } catch {
    // Fall through to raw text if upstream did not return JSON.
  }

  return trimmed.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function parseQueuedRedoPayload(text: string, jobId: string) {
  let payload: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      // A successful legacy backend may not return JSON. Keep the root job pollable.
    }
  }

  return {
    ...payload,
    ok: payload.ok !== false,
    job_id: typeof payload.job_id === "string" && payload.job_id ? payload.job_id : jobId,
    status: typeof payload.status === "string" && payload.status ? payload.status : "processing",
    workflowState:
      typeof payload.workflowState === "string" && payload.workflowState
        ? payload.workflowState
        : "processing",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }

  const jobId = Array.isArray(req.query.job_id) ? req.query.job_id[0] : req.query.job_id;
  if (!jobId) {
    return res.status(400).json({ error: "Missing job id" });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
  headers["X-User-Id"] = session.user.id;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}/redo`, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body || {}),
    });
  } catch {
    return res.status(502).json({ error: "Unable to reach transcription backend." });
  }

  const text = await upstream.text();
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) res.setHeader("Retry-After", retryAfter);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  if (upstream.ok) {
    if (!retryAfter) res.setHeader("Retry-After", "2");
    res.setHeader("Location", `/api/jobs/${encodeURIComponent(jobId)}`);
    return res.status(upstream.status).json(parseQueuedRedoPayload(text, jobId));
  }

  return res.status(upstream.status).json({ error: readUpstreamError(text, upstream.status) });
}
