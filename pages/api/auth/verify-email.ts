import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { parseVerifyUserId } from "../../../lib/emailVerification";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!token) {
      return res.status(400).json({ error: "Invalid token." });
    }

    const verification = await prisma.verificationToken.findUnique({
      where: { token },
    });
    if (!verification || verification.expires < new Date()) {
      return res.status(400).json({ error: "Verification link is invalid or expired." });
    }

    const userId = parseVerifyUserId(verification.identifier);
    if (!userId) {
      return res.status(400).json({ error: "Verification link is invalid." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...( { emailVerifiedBool: true } as any),
        emailVerified: new Date(),
      } as any,
    });

    await prisma.verificationToken.delete({
      where: { token },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("verify-email error", error);
    return res.status(500).json({ error: "Could not verify email." });
  }
}
