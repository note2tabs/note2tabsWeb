import type { NextApiRequest, NextApiResponse } from "next";
import { sendTransactionalEmail } from "../../../lib/email";
import {
  buildAffiliateApplicationEmail,
  validateAffiliateApplication,
} from "../../../lib/affiliateApplication";

const MAX_BODY_BYTES = 12_000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 4;
const attempts = new Map<string, { count: number; resetAt: number }>();

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || "";
}

function requestIp(req: NextApiRequest) {
  return firstHeader(req.headers["x-forwarded-for"]).split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

function isSameOrigin(req: NextApiRequest) {
  const origin = firstHeader(req.headers.origin);
  const forwardedHost = firstHeader(req.headers["x-forwarded-host"]);
  const host = forwardedHost || firstHeader(req.headers.host);
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isRateLimited(ip: string, now = Date.now()) {
  // Bound the best-effort per-instance limiter, as in the internship flow.
  for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
  if (!attempts.has(ip) && attempts.size >= 10000) return true;
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const declaredLength = Number(firstHeader(req.headers["content-length"]));
  if ((Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) || !isSameOrigin(req)) {
    return res.status(400).json({ error: "The application could not be submitted." });
  }
  if (isRateLimited(requestIp(req))) {
    return res.status(429).json({ error: "Too many attempts. Please try again later." });
  }

  const result = validateAffiliateApplication(req.body);
  if (!result.ok) {
    return res.status(result.code === "spam" ? 400 : 422).json({ error: result.message });
  }

  try {
    const email = buildAffiliateApplicationEmail(result.application);
    const sent = await sendTransactionalEmail({ language:{kind:"internal"}, to: "business@note2tabs.com", ...email });
    if (!sent) throw new Error("Application email not accepted");
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("affiliate_application_delivery_failed");
    return res.status(503).json({ error: "We could not send your application. Please try again." });
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "12kb" },
  },
};
