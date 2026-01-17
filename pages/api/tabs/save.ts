import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { sourceLabel, sourceType, durationSec, resultJson } = req.body || {};
    if (!resultJson || typeof resultJson !== "string") {
      return res.status(400).json({ error: "resultJson must be a JSON string" });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(resultJson);
      if (!Array.isArray(parsed)) {
        return res.status(400).json({ error: "resultJson must be an array (string[][])" });
      }
    } catch (error) {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const job = await prisma.tabJob.create({
      data: {
        userId: session.user.id,
        sourceType: typeof sourceType === "string" ? sourceType : "UNKNOWN",
        sourceLabel: typeof sourceLabel === "string" ? sourceLabel : null,
        durationSec: typeof durationSec === "number" ? durationSec : null,
        resultJson,
      },
    });

    return res.status(200).json({ ok: true, jobId: job.id });
  } catch (error) {
    console.error("save tab error", error);
    return res.status(500).json({ error: "Could not save tab" });
  }
}
