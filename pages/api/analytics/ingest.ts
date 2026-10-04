import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { ingestAnalyticsEvents } from "../../../lib/analyticsV2/ingest";
import { attachFunctionTiming } from "../../../lib/functionTiming";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  attachFunctionTiming(res, "/api/analytics/ingest");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (process.env.NODE_ENV !== "production") {
    return res.status(200).json({
      ok: true,
      reason: "analytics_disabled_in_dev",
      received: 0,
      written: 0,
      deduped: 0,
      dualWritten: 0,
      blocked: 0,
    });
  }

  try {
    // Telemetry needs verified identity, without session callbacks or cookie renewal.
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const accountId = typeof token?.id === "string" ? token.id : null;
    const result = await ingestAnalyticsEvents({
      req,
      res,
      body: req.body,
      accountId,
      source: "api_ingest",
    });
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("analytics ingest error", error);
    return res.status(400).json({
      ok: false,
      error: error?.message || "Could not ingest analytics event.",
    });
  }
}
