import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../lib/prisma";
import { authOptions } from "../auth/[...nextauth]";

const WRITE_INTERVAL_MS = 15 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }

  const activeAt = new Date();
  const staleBefore = new Date(activeAt.getTime() - WRITE_INTERVAL_MS);
  await prisma.user.updateMany({
    where: {
      id: session.user.id,
      lastActiveAt: { lt: staleBefore },
    },
    data: { lastActiveAt: activeAt },
  });

  return res.status(200).json({ ok: true });
}
