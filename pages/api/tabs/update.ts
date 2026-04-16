import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { normalizeStoredTabPayload } from "../../../lib/storedTabs";
import { buildUniqueTabJobLabel } from "../../../lib/tabJobNames";

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

    const { id, sourceLabel, resultJson } = req.body || {};
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing tab id" });
    }
    if (typeof resultJson !== "string") {
      return res.status(400).json({ error: "resultJson must be a stringified tab payload" });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(resultJson);
      const normalized = normalizeStoredTabPayload(parsed);
      if (normalized.tabs.length === 0 || normalized.transcriberSegments.length === 0) {
        return res.status(400).json({ error: "resultJson must include tabs and transcriberSegments" });
      }
    } catch (error) {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const job = await prisma.tabJob.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!job) {
      return res.status(404).json({ error: "Tab not found" });
    }

    const siblings = await prisma.tabJob.findMany({
      where: {
        userId: session.user.id,
        NOT: { id },
      },
      select: { sourceLabel: true },
    });
    const nextSourceLabel = buildUniqueTabJobLabel(
      typeof sourceLabel === "string" && sourceLabel.trim() ? sourceLabel : job.sourceLabel || "Untitled",
      siblings.map((item) => item.sourceLabel || "").filter(Boolean),
      job.sourceLabel || null
    );

    const updated = await prisma.tabJob.update({
      where: { id },
      data: {
        sourceLabel: nextSourceLabel,
        resultJson,
      },
    });

    return res.status(200).json({
      ok: true,
      job: {
        id: updated.id,
        sourceLabel: updated.sourceLabel,
        resultJson: updated.resultJson,
      },
    });
  } catch (error) {
    console.error("update tab error", error);
    return res.status(500).json({ error: "Could not update tab" });
  }
}
