import type { NextApiRequest, NextApiResponse } from "next";
import { AFFILIATE_COOKIE, normalizeAffiliateCode } from "../../../lib/affiliate";
import { prisma } from "../../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  const code = normalizeAffiliateCode(req.body?.code);
  if (!code) return res.status(400).json({ error: "Invalid referral code" });
  const affiliate = await prisma.affiliate.findUnique({
    where: { code },
    select: { status: true, cookieDays: true },
  });
  if (!affiliate || affiliate.status !== "ACTIVE") {
    return res.status(404).json({ error: "Referral code not found" });
  }
  const maxAge = affiliate.cookieDays * 24 * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${AFFILIATE_COOKIE}=${encodeURIComponent(code)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
  return res.status(200).json({ ok: true });
}
