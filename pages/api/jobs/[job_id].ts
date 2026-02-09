import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET = process.env.NOTE2TABS_BACKEND_SECRET;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jobId = Array.isArray(req.query.job_id) ? req.query.job_id[0] : req.query.job_id;
  if (!jobId) {
    return res.status(400).json({ error: "Missing job id" });
  }

  const headers: Record<string, string> = {};
  if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.id) headers["X-User-Id"] = session.user.id;

  const upstream = await fetch(`${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
    headers,
  });
  const text = await upstream.text();
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("Content-Type", contentType);
  if (!text) return res.end();
  return res.send(text);
}
