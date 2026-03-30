import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jobId = Array.isArray(req.query.job_id) ? req.query.job_id[0] : req.query.job_id;
  const artifact = Array.isArray(req.query.artifact) ? req.query.artifact[0] : req.query.artifact;
  if (!jobId || !artifact) {
    return res.status(400).json({ error: "Missing job id or artifact" });
  }

  const headers: Record<string, string> = {};
  if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.id) headers["X-User-Id"] = session.user.id;

  const upstream = await fetch(
    `${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifact)}`,
    { headers }
  );
  const buffer = Buffer.from(await upstream.arrayBuffer());

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "content-encoding" || lower === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  return res.send(buffer);
}
