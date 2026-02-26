import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { parseRequestCookies } from "../../../lib/analyticsV2/cookies";
import { persistConsentState } from "../../../lib/analyticsV2/consent";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    const userId = session?.user?.id || null;
    const cookies = parseRequestCookies(req);

    const result = await persistConsentState({
      prismaClient: prisma,
      res,
      cookies,
      state: "denied",
      userId,
      source: "api_consent_deny",
    });

    if (userId) {
      await prisma.userConsent.upsert({
        where: { userId },
        update: {
          granted: false,
          sessionId: undefined,
          userId,
          fingerprintId: undefined,
        },
        create: {
          granted: false,
          userId,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      state: "denied",
      subjectId: result.subject.id.toString(),
    });
  } catch (error: any) {
    console.error("consent deny error", error);
    return res.status(500).json({ error: error?.message || "Could not deny consent" });
  }
}
