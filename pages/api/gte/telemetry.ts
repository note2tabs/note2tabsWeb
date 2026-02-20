import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { logGteAnalyticsEvent, type GteAnalyticsEvent } from "../../../lib/gteAnalytics";

type TelemetryBody = {
  event?: GteAnalyticsEvent;
  editorId?: string;
  sessionId?: string;
  durationSec?: number;
  path?: string;
};

const ALLOWED_EVENTS = new Set<GteAnalyticsEvent>([
  "gte_editor_visit",
  "gte_editor_session_start",
  "gte_editor_session_end",
]);

function parseBody(req: NextApiRequest): TelemetryBody {
  const body = req.body;
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as TelemetryBody;
    } catch {
      return {};
    }
  }
  if (typeof body === "object") {
    return body as TelemetryBody;
  }
  return {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const body = parseBody(req);
  const event = body.event;
  if (!event || !ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: "Invalid event" });
  }

  const editorId = typeof body.editorId === "string" ? body.editorId.trim() : "";
  if (!editorId) {
    return res.status(400).json({ error: "Missing editorId" });
  }

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : undefined;
  const rawDuration = Number(body.durationSec);
  const durationSec =
    Number.isFinite(rawDuration) && rawDuration >= 0
      ? Math.max(0, Math.min(60 * 60 * 24, Math.round(rawDuration)))
      : undefined;
  const path =
    typeof body.path === "string" && body.path.trim() ? body.path.trim() : `/gte/${editorId}`;

  await logGteAnalyticsEvent({
    userId: session.user.id,
    event,
    path,
    sessionId,
    payload: {
      editorId,
      ...(sessionId ? { sessionId } : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
    },
  });

  return res.status(200).json({ ok: true });
}
