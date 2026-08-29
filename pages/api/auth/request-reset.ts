import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { issueAndSendPasswordResetEmail } from "../../../lib/passwordReset";
import { EmailConfigurationError } from "../../../lib/email";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      // Avoid leaking user existence
      return res.status(200).json({
        ok: true,
      });
    }

    const result = await issueAndSendPasswordResetEmail({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    return res.status(200).json({
      ok: true,
      sent: result.sent,
    });
  } catch (error) {
    if (error instanceof EmailConfigurationError) {
      console.error("request-reset email configuration error", error);
      // Keep account existence and internal mail configuration private.
      return res.status(200).json({ ok: true });
    }

    console.error("request-reset error", error);
    return res.status(500).json({ error: "Could not start password reset." });
  }
}
