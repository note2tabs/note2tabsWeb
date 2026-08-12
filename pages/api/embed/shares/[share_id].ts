import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "../../../../lib/prisma";
import { isValidEmbedIdentifier } from "../../../../lib/embedIdentifiers";
import { rateLimit } from "../../../../lib/rateLimit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!rateLimit(req, res, { id: "embed-share-revoke", limit: 30, windowMs: 60_000 })) {
    return;
  }
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const shareId = Array.isArray(req.query.share_id) ? req.query.share_id[0] : req.query.share_id;
  if (!isValidEmbedIdentifier(shareId)) {
    return res.status(400).json({ error: "Invalid embed id" });
  }

  let result;
  try {
    result = await prisma.tabEmbedShare.updateMany({
      where: { id: shareId, userId: session.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    return res.status(503).json({ error: "Could not revoke this embed right now." });
  }
  if (result.count !== 1) {
    return res.status(404).json({ error: "Embed not found" });
  }
  return res.status(200).json({ ok: true });
}
