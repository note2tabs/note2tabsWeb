import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "../../../../lib/prisma";
import { rateLimit } from "../../../../lib/rateLimit";
import {
  EmbedEditorLoadError,
  buildEmbedCredentials,
  createEmbedSecret,
  hashEmbedSecret,
  loadSanitizedEditorForEmbed,
} from "../../../../lib/embedTabs";
import { isValidEmbedIdentifier } from "../../../../lib/embedIdentifiers";
import { getAppBaseUrl } from "../../../../lib/urls";

const MAX_ACTIVE_SHARES_PER_EDITOR = 5;

const setManagementHeaders = (res: NextApiResponse) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
};

const readEditorId = (req: NextApiRequest) => {
  const value = req.method === "GET" ? req.query.editorId : req.body?.editorId;
  return Array.isArray(value) ? value[0] : value;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setManagementHeaders(res);
  if (!rateLimit(req, res, { id: "embed-share-management", limit: 60, windowMs: 60_000 })) {
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const editorId = readEditorId(req);
  if (!isValidEmbedIdentifier(editorId) || editorId === "local") {
    return res.status(400).json({ error: "Invalid editor id" });
  }

  if (req.method === "GET") {
    try {
      const shares = await prisma.tabEmbedShare.findMany({
        where: { userId: session.user.id, editorId, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, tokenFingerprint: true, createdAt: true },
      });
      return res.status(200).json({
        shares: shares.map((share) => ({
          id: share.id,
          tokenFingerprint: share.tokenFingerprint,
          createdAt: share.createdAt.toISOString(),
        })),
      });
    } catch {
      return res.status(503).json({ error: "Embed settings are temporarily unavailable." });
    }
  }

  let activeShareCount: number;
  let ownedCanvas: { canvas_id: string } | null;
  let ownedLegacyEditor: { editor_id: string } | null;
  try {
    [activeShareCount, ownedCanvas] = await Promise.all([
      prisma.tabEmbedShare.count({
        where: { userId: session.user.id, editorId, revokedAt: null },
      }),
      prisma.canvases.findUnique({
        where: {
          user_id_canvas_id: {
            user_id: session.user.id,
            canvas_id: editorId,
          },
        },
        select: { canvas_id: true },
      }),
    ]);
    ownedLegacyEditor = ownedCanvas
      ? null
      : await prisma.editor_snapshots.findUnique({
          where: {
            user_id_editor_id: {
              user_id: session.user.id,
              editor_id: editorId,
            },
          },
          select: { editor_id: true },
        });
  } catch {
    return res.status(503).json({ error: "Embed settings are temporarily unavailable." });
  }
  if (activeShareCount >= MAX_ACTIVE_SHARES_PER_EDITOR) {
    return res.status(409).json({
      error: `This editor already has ${MAX_ACTIVE_SHARES_PER_EDITOR} active embeds. Revoke one before creating another.`,
    });
  }

  if (!ownedCanvas && !ownedLegacyEditor) {
    return res.status(404).json({ error: "Editor not found" });
  }

  let sanitizedEditor;
  try {
    sanitizedEditor = await loadSanitizedEditorForEmbed({
      ownerId: session.user.id,
      editorId,
    });
  } catch (error) {
    if (error instanceof EmbedEditorLoadError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(502).json({ error: "Could not verify this editor." });
  }

  const secret = createEmbedSecret();
  const tokenHash = hashEmbedSecret(secret);
  let created;
  try {
    created = await prisma.tabEmbedShare.create({
      data: {
        userId: session.user.id,
        editorId,
        tokenHash,
        tokenFingerprint: tokenHash.slice(0, 8),
      },
      select: { id: true, tokenFingerprint: true, createdAt: true },
    });
  } catch {
    return res.status(503).json({ error: "Could not create an embed right now." });
  }
  const credentials = buildEmbedCredentials({
    baseUrl: getAppBaseUrl(req),
    shareId: created.id,
    secret,
    title: sanitizedEditor.title,
  });

  return res.status(201).json({
    share: {
      id: created.id,
      tokenFingerprint: created.tokenFingerprint,
      createdAt: created.createdAt.toISOString(),
    },
    ...credentials,
  });
}
