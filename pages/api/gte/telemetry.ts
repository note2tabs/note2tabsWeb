import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { logGteAnalyticsEvents, type GteAnalyticsEvent } from "../../../lib/gteAnalytics";
import { attachFunctionTiming } from "../../../lib/functionTiming";

type TelemetryBody = {
  event?: GteAnalyticsEvent;
  editorId?: string;
  sessionId?: string;
  durationSec?: number;
  activeDurationSec?: number;
  heartbeatSequence?: number;
  mode?: string;
  path?: string;
  ts?: string;
};

type TelemetryRequestBody = TelemetryBody | { events?: TelemetryBody[] };

const ALLOWED_EVENTS = new Set<GteAnalyticsEvent>([
  "gte_editor_action",
  "gte_editor_visit",
  "gte_editor_session_start",
  "gte_editor_session_end",
  "gte_editor_session_heartbeat",
  "gte_practice_started",
]);

function parseBody(req: NextApiRequest): TelemetryRequestBody {
  const body = req.body;
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as TelemetryRequestBody;
    } catch {
      return {};
    }
  }
  if (typeof body === "object") {
    return body as TelemetryRequestBody;
  }
  return {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let eventCount = 0;
  attachFunctionTiming(res, "/api/gte/telemetry", () => ({ eventCount }));
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const parsed = parseBody(req);
  const bodies: TelemetryBody[] =
    "events" in parsed && Array.isArray(parsed.events)
      ? parsed.events.slice(0, 20)
      : [parsed as TelemetryBody];
  eventCount = bodies.length;
  if (!bodies.length) return res.status(400).json({ error: "Missing events" });

  const events = [];
  for (const body of bodies) {
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
    const rawActiveDuration = Number(body.activeDurationSec);
    const activeDurationSec =
      Number.isFinite(rawActiveDuration) && rawActiveDuration >= 0
        ? Math.max(0, Math.min(60 * 60 * 24, Math.round(rawActiveDuration)))
        : undefined;
    const rawHeartbeatSequence = Number(body.heartbeatSequence);
    const heartbeatSequence =
      Number.isFinite(rawHeartbeatSequence) && rawHeartbeatSequence >= 0
        ? Math.min(24 * 60, Math.floor(rawHeartbeatSequence))
        : undefined;
    const mode = body.mode === "practice" ? "practice" : undefined;
    const path =
      typeof body.path === "string" && body.path.trim() ? body.path.trim() : `/gte/${editorId}`;

    events.push({
      userId: session?.user?.id || null,
      event,
      path,
      sessionId,
      timestamp: typeof body.ts === "string" ? body.ts : undefined,
      payload: {
        editorId,
        ...(sessionId ? { sessionId } : {}),
        ...(durationSec !== undefined ? { durationSec } : {}),
        ...(activeDurationSec !== undefined ? { activeDurationSec } : {}),
        ...(heartbeatSequence !== undefined ? { heartbeatSequence } : {}),
        ...(mode ? { mode } : {}),
      },
      req,
      res,
    });
  }
  await logGteAnalyticsEvents(events);

  return res.status(200).json({ ok: true });
}
