import type { NextApiRequest, NextApiResponse } from "next";

// Oct 15 localization activation audit: Japan and China are the two clear
// low-activation markets. Keep this explicit; never widen via a stale env flag.
const REPLAY_COUNTRIES = new Set(["JP", "CN"]);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Vercel supplies/overwrites this header. Never trust it on a local server or
  // use URL parameters, cookies, language or forwarded headers as a fallback.
  const country = req.headers["x-vercel-ip-country"];
  const eligible = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production"
    && typeof country === "string" && REPLAY_COUNTRIES.has(country);
  return res.status(200).json({ eligible });
}
