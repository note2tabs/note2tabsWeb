import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { ingestAnalyticsEvents } from "../../../lib/analyticsV2/ingest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    const accountId = session?.user?.id || null;
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
