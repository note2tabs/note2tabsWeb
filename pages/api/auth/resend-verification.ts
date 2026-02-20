import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { issueAndSendVerificationEmail } from "../../../lib/emailVerification";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    const requestedEmail =
      typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : null;

    let user = null;
    if (session?.user?.id) {
      user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true, emailVerified: true },
      });
    } else if (requestedEmail && requestedEmail.includes("@")) {
      user = await prisma.user.findUnique({
        where: { email: requestedEmail },
        select: { id: true, email: true, name: true, emailVerified: true },
      });
    }

    if (!user) {
      return res.status(200).json({ ok: true });
    }

    const alreadyVerified = Boolean((user as any).emailVerifiedBool || user.emailVerified);
    if (alreadyVerified) {
      if (!(user as any).emailVerifiedBool) {
        await prisma.user.update({
          where: { id: user.id },
          data: { ...( { emailVerifiedBool: true } as any) } as any,
        });
      }
      return res.status(200).json({ ok: true, alreadyVerified: true });
    }

    const result = await issueAndSendVerificationEmail(user);
    return res.status(200).json({ ok: true, sent: result.sent });
  } catch (error) {
    console.error("resend-verification error", error);
    return res.status(500).json({ error: "Could not resend verification email." });
  }
}
