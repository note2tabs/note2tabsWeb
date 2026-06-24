import type { NextApiRequest, NextApiResponse } from "next";
import {
  clearAnalyticsIdentifierCookies,
  setConsentCookie,
} from "../../../lib/analyticsV2/cookies";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  clearAnalyticsIdentifierCookies(res);
  setConsentCookie(res, "denied");
  return res.status(200).json({ ok: true, state: "denied" });
}

