import type { NextApiRequest, NextApiResponse } from "next";
import { hash } from "bcryptjs";
import { prisma } from "../../../lib/prisma";

const MIN_PASSWORD = 10;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, password, name } = req.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!password || typeof password !== "string" || password.length < MIN_PASSWORD) {
      return res
        .status(400)
        .json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await hash(password, 10);
    await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || null,
        passwordHash,
        role: "FREE",
        tokensRemaining: 120,
      },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Signup error", error);
    return res.status(500).json({ error: "Could not create account." });
  }
}
