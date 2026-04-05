import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { persistTrackInstrumentSelection } from "../../../lib/gteTrackInstrumentStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const editorId = typeof req.body?.editorId === "string" ? req.body.editorId.trim() : "";
  const laneId = typeof req.body?.laneId === "string" ? req.body.laneId.trim() : "";
  const instrumentId =
    typeof req.body?.instrumentId === "string" ? req.body.instrumentId.trim() : null;

  if (!editorId || !laneId) {
    return res.status(400).json({ error: "editorId and laneId are required." });
  }

  await persistTrackInstrumentSelection({
    userId: session.user.id,
    editorId,
    laneId,
    instrumentId,
  });

  return res.status(200).json({ ok: true });
}
