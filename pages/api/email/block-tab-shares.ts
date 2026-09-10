import type { NextApiRequest, NextApiResponse } from "next";
import { blockTabShareEmails, readTabShareBlockToken } from "../../../lib/tabShareEmailPreferences";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const email = readTabShareBlockToken(token);
  if (!email) return res.status(400).json({ error: "This preference link is invalid." });
  await blockTabShareEmails(email);
  return res.status(200).json({ ok: true });
}
