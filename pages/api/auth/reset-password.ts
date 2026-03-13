import type { NextApiRequest, NextApiResponse } from "next";
import { hash } from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { normalizeResetCode, parseResetIdentifier } from "../../../lib/passwordReset";

const MIN_PASSWORD = 10;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawToken =
      req.method === "GET"
        ? typeof req.query?.token === "string"
          ? req.query.token
          : ""
        : typeof req.body?.token === "string"
        ? req.body.token
        : "";
    const token = rawToken.trim();
    if (!token) {
      return res.status(400).json({ error: "Invalid token" });
    }

    const verification = await prisma.verificationToken.findUnique({ where: { token } });
    if (!verification || verification.expires < new Date()) {
      return res.status(400).json({ error: "Token expired or invalid." });
    }

    const resetPayload = parseResetIdentifier(verification.identifier);
    if (!resetPayload) {
      return res.status(400).json({ error: "Token expired or invalid." });
    }

    if (req.method === "GET") {
      return res.status(200).json({ ok: true });
    }

    const { password, code } = req.body || {};
    if (!password || typeof password !== "string" || password.length < MIN_PASSWORD) {
      return res
        .status(400)
        .json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
    }
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Reset code is required." });
    }
    if (normalizeResetCode(code) !== normalizeResetCode(resetPayload.code)) {
      return res.status(400).json({ error: "Reset code is invalid." });
    }

    const user = await prisma.user.findUnique({
      where: { id: resetPayload.userId },
    });
    if (!user) {
      return res.status(400).json({ error: "User not found." });
    }

    const passwordHash = await hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await prisma.verificationToken.delete({ where: { token } });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("reset-password error", error);
    return res.status(500).json({ error: "Could not reset password." });
  }
}
