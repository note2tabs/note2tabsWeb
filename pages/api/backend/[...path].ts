import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { createBackendToken } from "../../../lib/backendToken";

const BASE_URL = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const pathParam = req.query.path;
  const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;
  if (!path) {
    return res.status(400).json({ error: "Missing path" });
  }
  if (!path.startsWith("v1/")) {
    return res.status(400).json({ error: "Invalid backend path" });
  }

  const token = createBackendToken({
    sub: session.user.id,
    email: session.user.email,
    role: session.user.role,
  });

  const search = req.url?.split("?")[1];
  const targetUrl = `${BASE_URL.replace(/\/$/, "")}/${path}${search ? `?${search}` : ""}`;
  const isJson = (req.headers["content-type"] || "").includes("application/json");
  const method = req.method || "GET";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let backendRes: Response;
  try {
    backendRes = await fetch(targetUrl, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": isJson ? "application/json" : (req.headers["content-type"] as string) || "application/json",
        "X-Request-ID": (req.headers["x-request-id"] as string) || "",
      },
      body:
        method === "GET" || method === "HEAD"
          ? undefined
          : isJson
          ? JSON.stringify(req.body || {})
          : (req.body as any),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    return res.status(502).json({ error: "Backend unavailable" });
  } finally {
    clearTimeout(timeout);
  }

  res.status(backendRes.status);
  backendRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-encoding") return;
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });

  const buffer = Buffer.from(await backendRes.arrayBuffer());
  res.send(buffer);
}
