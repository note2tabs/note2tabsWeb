import { createHash } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import {
  EmbedEditorLoadError,
  loadSanitizedEditorForEmbed,
  readEmbedBearerSecret,
  verifyEmbedSecret,
} from "../../../../lib/embedTabs";
import { isValidEmbedIdentifier } from "../../../../lib/embedIdentifiers";
import { rateLimit } from "../../../../lib/rateLimit";

const EMBED_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const NOT_FOUND_RESPONSE = { error: "Embedded tab not found" };

const setPublicHeaders = (res: NextApiResponse) => {
  res.setHeader("Cache-Control", "private, no-cache, max-age=0, must-revalidate");
  res.setHeader("Content-Security-Policy", EMBED_API_CSP);
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Vary", "Authorization, Accept-Encoding");
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setPublicHeaders(res);
  if (!rateLimit(req, res, { id: "embed-tab-read", limit: 180, windowMs: 60_000 })) {
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const shareId = Array.isArray(req.query.share_id) ? req.query.share_id[0] : req.query.share_id;
  const secret = readEmbedBearerSecret(req.headers.authorization);
  if (!isValidEmbedIdentifier(shareId) || !secret) {
    return res.status(404).json(NOT_FOUND_RESPONSE);
  }

  let share;
  try {
    share = await prisma.tabEmbedShare.findUnique({
      where: { id: shareId },
      select: { userId: true, editorId: true, tokenHash: true, revokedAt: true },
    });
  } catch {
    return res.status(503).json({ error: "Embedded tab is temporarily unavailable" });
  }
  const expectedHash = share?.tokenHash || "0".repeat(64);
  const validSecret = verifyEmbedSecret(secret, expectedHash);
  if (!share || share.revokedAt || !validSecret) {
    return res.status(404).json(NOT_FOUND_RESPONSE);
  }

  let payload;
  try {
    payload = await loadSanitizedEditorForEmbed({
      ownerId: share.userId,
      editorId: share.editorId,
    });
  } catch (error) {
    if (error instanceof EmbedEditorLoadError && error.status === 404) {
      return res.status(404).json(NOT_FOUND_RESPONSE);
    }
    return res.status(502).json({ error: "Embedded tab is temporarily unavailable" });
  }

  const serialized = JSON.stringify(payload);
  const etag = `"${createHash("sha256").update(serialized).digest("base64url")}"`;
  res.setHeader("ETag", etag);
  const ifNoneMatch = Array.isArray(req.headers["if-none-match"])
    ? req.headers["if-none-match"][0]
    : req.headers["if-none-match"];
  if (ifNoneMatch === etag) {
    return res.status(304).end();
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).send(serialized);
}
