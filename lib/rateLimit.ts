import type { NextApiRequest, NextApiResponse } from "next";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  id?: string;
};

type RateEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateEntry>();

const getClientId = (req: NextApiRequest) => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return ip?.trim() || req.socket.remoteAddress || "unknown";
};

export const rateLimit = (
  req: NextApiRequest,
  res: NextApiResponse,
  options: RateLimitOptions
) => {
  const now = Date.now();
  const key = `${options.id || "global"}:${getClientId(req)}`;
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
  } else {
    entry.count += 1;
  }

  const current = store.get(key)!;
  res.setHeader("X-RateLimit-Limit", String(options.limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, options.limit - current.count)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));

  if (current.count > options.limit) {
    res.status(429).json({ error: "Too many requests. Try again shortly." });
    return false;
  }
  return true;
};
