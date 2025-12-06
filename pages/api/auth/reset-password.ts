import type { NextApiRequest, NextApiResponse } from "next";
import { hash } from "bcryptjs";
import { prisma } from "../../../lib/prisma";

const MIN_PASSWORD = 6;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { token, password } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Invalid token" });
    }
    if (!password || typeof password !== "string" || password.length < MIN_PASSWORD) {
      return res
        .status(400)
        .json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
    }

    const verification = await prisma.verificationToken.findUnique({ where: { token } });
    if (!verification || verification.expires < new Date()) {
      return res.status(400).json({ error: "Token expired or invalid." });
    }

    const user = await prisma.user.findUnique({
      where: { email: verification.identifier },
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
