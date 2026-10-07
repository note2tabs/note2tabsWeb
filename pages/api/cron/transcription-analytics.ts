import type { NextApiRequest, NextApiResponse } from "next";
import { deliverTranscriptionAnalytics } from "../../../lib/transcriptionAnalytics";

export const config = { maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.TRANSCRIPTION_ANALYTICS_CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    return res.status(200).json(await deliverTranscriptionAnalytics());
  } catch {
    // Delivery stays pending in the root job and retries on the next run.
    return res.status(503).json({ error: "Analytics delivery will be retried" });
  }
}
