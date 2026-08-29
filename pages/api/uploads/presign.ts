import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import {
  isEmailVerificationRequiredServer,
  isLocalNoDbServerMode,
} from "../../../lib/serverDevMode";

const MAX_FREE_BYTES = 50 * 1024 * 1024;
const MAX_PREMIUM_BYTES = 200 * 1024 * 1024;

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isLocalNoDbServerMode) {
    return res.status(503).json({
      error: "Presign is disabled in local no-db mode. Use direct upload instead.",
    });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
  let currentRole = "FREE";
  if (isEmailVerificationRequiredServer) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        role: true,
        emailVerified: true,
        emailVerifiedBool: true,
        unverifiedTranscriptionUsed: true,
      },
    });
    currentRole = user?.role || "FREE";
    const isEmailVerified = Boolean(user?.emailVerifiedBool || user?.emailVerified);
    if (!user || (!isEmailVerified && user.unverifiedTranscriptionUsed)) {
      return res.status(403).json({
        error: "Please verify your email to continue using the transcriber.",
        verificationRequired: true,
      });
    }
  } else {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    currentRole = user?.role || "FREE";
  }

  const { fileName, contentType, size } = req.body || {};
  const sizeNum = typeof size === "number" ? size : Number(size);
  if (typeof fileName !== "string" || !Number.isFinite(sizeNum) || sizeNum <= 0) {
    return res.status(400).json({ error: "Choose a valid audio file and try again." });
  }

  const isPremium =
    currentRole === "PREMIUM" ||
    currentRole === "ADMIN" ||
    currentRole === "MODERATOR" ||
    currentRole === "MOD";
  const maxBytes = isPremium ? MAX_PREMIUM_BYTES : MAX_FREE_BYTES;
  if (sizeNum > maxBytes) {
    return res.status(413).json({
      error: `This file exceeds your plan's ${Math.round(maxBytes / (1024 * 1024))} MB upload limit. Choose a smaller file or shorter section.`,
      maxBytes,
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-User-Id": session.user.id,
  };
  if (BACKEND_SECRET) {
    headers["X-Backend-Secret"] = BACKEND_SECRET;
  }

  const upstream = await fetch(`${API_BASE}/uploads/presign`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fileName,
      contentType: typeof contentType === "string" ? contentType : "application/octet-stream",
    }),
  });
  const rawText = await upstream.text();
  let data: any = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    data = {};
  }
  if (!upstream.ok) {
    console.error("upload presign upstream error", {
      status: upstream.status,
      userId: session.user.id,
      fileName,
      contentType,
      size: sizeNum,
      response: rawText || null,
    });
    const errorMessage =
      upstream.status === 413
        ? "This file is larger than your plan allows. Choose a shorter section or a smaller file."
        : upstream.status === 401 || upstream.status === 403
          ? "Your session has expired. Sign in again, then reselect this file."
          : upstream.status === 429
            ? "Uploads are temporarily busy. Wait a moment and try this file again."
            : upstream.status >= 500
              ? "Secure file upload is temporarily unavailable. Your file remains selected, so you can try again shortly."
              : "We could not prepare this file for upload. Check that it is an MP3, WAV, or M4A file and try again.";
    return res.status(upstream.status).json({ error: errorMessage });
  }
  if (!data?.url || !data?.key) {
    console.error("upload presign invalid upstream response", {
      userId: session.user.id,
      fileName,
      response: rawText || null,
    });
    return res.status(502).json({
      error: "Secure file upload is temporarily unavailable. Your file remains selected, so you can try again shortly.",
    });
  }
  return res.status(200).json({ url: data.url, key: data.key, maxBytes });
}
