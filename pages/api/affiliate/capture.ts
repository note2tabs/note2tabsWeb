import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { AFFILIATE_CLICK_COOKIE, AFFILIATE_COOKIE, normalizeAffiliateCode } from "../../../lib/affiliate";
import { trackAffiliateEvent } from "../../../lib/affiliateTracking";
import { prisma } from "../../../lib/prisma";

const safeLandingPath = (value: unknown) => {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.slice(0, 500);
};

const safeReferrerHost = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  try { return new URL(value).hostname.slice(0, 255) || null; } catch { return null; }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  const code = normalizeAffiliateCode(req.body?.code);
  if (!code) return res.status(400).json({ error: "Invalid referral code" });
  const affiliate = await prisma.affiliate.findUnique({
    where: { code },
    select: { id: true, code: true, status: true, cookieDays: true },
  });
  if (!affiliate || affiliate.status !== "ACTIVE") {
    return res.status(404).json({ error: "Referral code not found" });
  }
  const clickId = randomUUID();
  const maxAge = affiliate.cookieDays * 24 * 60 * 60;
  const landingPath = safeLandingPath(req.body?.landingPath);
  const referrerHost = safeReferrerHost(req.body?.referrer);
  res.setHeader(
    "Set-Cookie",
    [
      `${AFFILIATE_COOKIE}=${encodeURIComponent(code)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      `${AFFILIATE_CLICK_COOKIE}=${clickId}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    ]
  );
  await trackAffiliateEvent({
    distinctId: clickId,
    event: "affiliate_link_clicked",
    insertId: `affiliate-click:${clickId}`,
    properties: {
      affiliate_id: affiliate.id,
      affiliate_code: affiliate.code,
      affiliate_click_id: clickId,
      landing_path: landingPath,
      referrer_host: referrerHost || undefined,
    },
  });
  return res.status(200).json({ ok: true, clickId });
}
