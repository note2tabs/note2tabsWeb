import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { once } from "node:events";
import { authOptions } from "../../../auth/[...nextauth]";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;

const FORWARDED_RESPONSE_HEADERS = new Set([
  "accept-ranges",
  "content-disposition",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
]);

function getRequestHeader(req: NextApiRequest, name: "range" | "if-range") {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function isSafeArtifactRedirect(location: string) {
  try {
    const url = new URL(location);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function streamResponseBody(upstream: Response, res: NextApiResponse) {
  if (!upstream.body) {
    return res.end();
  }

  for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
    if (!res.write(Buffer.from(chunk))) {
      await once(res, "drain");
    }
  }
  return res.end();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }

  const jobId = Array.isArray(req.query.job_id) ? req.query.job_id[0] : req.query.job_id;
  const artifact = Array.isArray(req.query.artifact) ? req.query.artifact[0] : req.query.artifact;
  if (!jobId || !artifact) {
    return res.status(400).json({ error: "Missing job id or artifact" });
  }

  const headers: Record<string, string> = {};
  if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
  headers["X-User-Id"] = session.user.id;

  const range = getRequestHeader(req, "range");
  const ifRange = getRequestHeader(req, "if-range");
  if (range) headers.Range = range;
  if (ifRange) headers["If-Range"] = ifRange;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifact)}`,
      { headers, redirect: "manual" }
    );
  } catch {
    return res.status(502).json({ error: "Unable to reach transcription backend." });
  }

  const location = upstream.headers.get("location");
  if (upstream.status === 307 && (!location || !isSafeArtifactRedirect(location))) {
    return res.status(502).json({ error: "Backend returned an invalid artifact location." });
  }

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (FORWARDED_RESPONSE_HEADERS.has(key.toLowerCase())) res.setHeader(key, value);
  });

  if (upstream.status === 307 && location) {
    res.setHeader("Location", location);
  }

  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  if (upstream.status === 307) return res.end();

  return streamResponseBody(upstream, res);
}
