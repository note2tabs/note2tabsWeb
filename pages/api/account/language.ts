import { prisma } from "../../../lib/prisma";
import { syncStripeEmailLanguage } from "../../../lib/i18n/stripeEmailLanguage";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { accountEmailLocale, saveAccountLanguage } from "../../../lib/i18n/accountLanguage";
import { validLocale } from "../../../lib/i18n/preference";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).end();
  const locale = validLocale(req.body?.locale);
  if (!locale) return res.status(400).json({ error: "Unsupported language" });
  try {
    const changed = await saveAccountLanguage(session.user.id, locale, req.body?.initialize === true);
    const saved = await accountEmailLocale(session.user.id);
    if (changed) {
      const user = await prisma.user.findUnique({where:{id:session.user.id},select:{email:true,emailVerified:true,emailVerifiedBool:true}});
      if (user?.email && (user.emailVerified || user.emailVerifiedBool)) {
        try { await syncStripeEmailLanguage(user.email, saved); }
        catch { console.warn("stripe_email_language_sync_failed"); }
      }
    }
    return res.status(200).json({ locale: saved });
  } catch {
    console.error("account_language_save_failed");
    return res.status(503).json({ error: "Could not save language" });
  }
}
