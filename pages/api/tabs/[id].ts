import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { parseStoredTabPayload } from "../../../lib/storedTabs";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) {
      return res.status(400).json({ error: "Missing tab id" });
    }

    const tabJob = await prisma.tabJob.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        sourceLabel: true,
        createdAt: true,
        resultJson: true,
      },
    });

    if (!tabJob) {
      return res.status(404).json({ error: "Tab not found" });
    }

    const parsed = parseStoredTabPayload(tabJob.resultJson);
    return res.status(200).json({
      id: tabJob.id,
      sourceLabel: tabJob.sourceLabel || "Imported transcription",
      createdAt: tabJob.createdAt.toISOString(),
      tabs: parsed.tabs,
      transcriberSegments: parsed.transcriberSegments,
      backendJobId: parsed.backendJobId || null,
      multipleGuitars: parsed.multipleGuitars ?? null,
      review: parsed.review || null,
    });
  } catch (error) {
    console.error("get tab error", error);
    return res.status(500).json({ error: "Could not load tab" });
  }
}
