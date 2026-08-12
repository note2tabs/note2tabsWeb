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
const MAX_RATE_LIMIT_ENTRIES = 10_000;

const pruneRateLimitStore = (now: number) => {
  if (store.size < MAX_RATE_LIMIT_ENTRIES) return;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
  while (store.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
};

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
  pruneRateLimitStore(now);
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
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
    res.status(429).json({ error: "Too many requests. Try again shortly." });
    return false;
  }
  return true;
};
