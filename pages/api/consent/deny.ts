import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { engagementCollectionEnabled, purgeEngagementForAccount } from "../../../lib/engagement/server";
import {
  clearAnalyticsIdentifierCookies,
  setConsentCookie,
} from "../../../lib/analyticsV2/cookies";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  clearAnalyticsIdentifierCookies(res);
  setConsentCookie(res, "denied");
  if (engagementCollectionEnabled()) {
    try {
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.id) await purgeEngagementForAccount(session.user.id);
    } catch {
      console.error("engagement_optout_purge_failed");
      return res.status(503).json({ ok: false, state: "denied", error: "Please retry to finish clearing engagement history." });
    }
  }
  return res.status(200).json({ ok: true, state: "denied" });
}

