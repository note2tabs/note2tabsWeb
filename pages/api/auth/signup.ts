import type { NextApiRequest, NextApiResponse } from "next";
import { hash } from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { issueAndSendVerificationEmail } from "../../../lib/emailVerification";
import { STARTING_CREDITS } from "../../../lib/credits";

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
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || null,
        passwordHash,
        role: "FREE",
        tokensRemaining: STARTING_CREDITS,
        ...( { emailVerifiedBool: false } as any),
      } as any,
    });

    let sent = false;
    try {
      const result = await issueAndSendVerificationEmail({
        id: user.id,
        email: user.email,
        name: user.name,
      });
      sent = result.sent;
    } catch (mailError) {
      console.error("Signup verification email error", mailError);
    }

    return res.status(200).json({
      ok: true,
      requiresVerification: true,
      emailSent: sent,
      email: user.email,
    });
  } catch (error) {
    console.error("Signup error", error);
    return res.status(500).json({ error: "Could not create account." });
  }
}
