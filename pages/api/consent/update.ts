import type { NextApiRequest, NextApiResponse } from "next";
import { setConsentCookie } from "../../../lib/analyticsV2/cookies";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  setConsentCookie(res, "granted");
  return res.status(200).json({ ok: true, state: "granted" });
}

