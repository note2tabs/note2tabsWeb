import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "../auth/[...nextauth]";
import { linkIdentityToUser } from "../../../lib/analyticsV2/identity";

const bodySchema = z
  .object({
    fingerprintId: z.string().optional(),
    anonId: z.string().optional(),
    sessionId: z.string().optional(),
    source: z.enum(["signup", "login"]).optional(),
  })
  .optional();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const parsed = bodySchema.parse(
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}
    );

    const linked = await linkIdentityToUser({
      userId: session.user.id,
      source: parsed?.source || "login",
      req,
      res,
      rawFingerprint: parsed?.fingerprintId,
      anonId: parsed?.anonId,
      sessionId: parsed?.sessionId,
    });

    return res.status(200).json({ ok: true, linked });
  } catch (error: any) {
    console.error("analytics link identity error", error);
    return res.status(400).json({ error: error?.message || "Could not link identity" });
  }
}
