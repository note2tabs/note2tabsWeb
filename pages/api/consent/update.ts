import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { hashFingerprint } from "../../../lib/analyticsV2/fingerprintHash";
import { parseRequestCookies } from "../../../lib/analyticsV2/cookies";
import { persistConsentState } from "../../../lib/analyticsV2/consent";

const bodySchema = z.object({
  state: z.enum(["granted", "denied"]),
  fingerprintId: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const parsedBody = bodySchema.parse(typeof req.body === "string" ? JSON.parse(req.body) : req.body || {});
    const session = await getServerSession(req, res, authOptions);
    const userId = session?.user?.id || null;
    const cookies = parseRequestCookies(req);
    const fingerprintHash = hashFingerprint(parsedBody.fingerprintId);

    const result = await persistConsentState({
      prismaClient: prisma,
      res,
      cookies,
      state: parsedBody.state,
      userId,
      rawFingerprint: parsedBody.fingerprintId,
      fingerprintHash,
      source: "api_consent_update",
    });

    const sessionId = result.cookies.sessionId || cookies.analytics_session || null;
    if (userId) {
      await prisma.userConsent.upsert({
        where: { userId },
        update: {
          granted: parsedBody.state === "granted",
          sessionId: sessionId || undefined,
          userId: userId || undefined,
          fingerprintId: fingerprintHash || undefined,
        },
        create: {
          granted: parsedBody.state === "granted",
          sessionId: sessionId || undefined,
          userId: userId || undefined,
          fingerprintId: fingerprintHash || undefined,
        },
      });
    } else if (sessionId) {
      await prisma.userConsent.create({
        data: {
          granted: parsedBody.state === "granted",
          sessionId,
          fingerprintId: fingerprintHash || undefined,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      state: parsedBody.state,
      subjectId: result.subject.id.toString(),
    });
  } catch (error: any) {
    console.error("consent update error", error);
    return res.status(400).json({ error: error?.message || "Could not update consent" });
  }
}
