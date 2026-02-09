import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET = process.env.NOTE2TABS_BACKEND_SECRET;

function buildUrl(req: NextApiRequest) {
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : "";
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
  let body: string | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.body ?? {});
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
  if (!text) {
    return res.end();
  }
  return res.send(text);
}
