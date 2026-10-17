import { ingestAnalyticsEvents } from "./analyticsV2/ingest";
import type { NextApiRequest, NextApiResponse } from "next";

export type GteAnalyticsEvent =
  | "gte_editor_created"
  | "gte_editor_imported"
  | "gte_editor_saved"
  | "gte_editor_exported"
  | "gte_editor_action"
  | "gte_editor_session_heartbeat"
  | "gte_practice_started"
  | "gte_editor_visit"
  | "gte_editor_session_start"
  | "gte_editor_session_end";

type LogGteAnalyticsInput = {
  userId?: string | null;
  event: GteAnalyticsEvent;
  eventId?: string;
  anonId?: string;
  path?: string;
  sessionId?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
  req?: NextApiRequest;
  res?: NextApiResponse;
};

export async function logGteAnalyticsEvent(input: LogGteAnalyticsInput) {
  return logGteAnalyticsEvents([input]);
}

export async function logGteAnalyticsEvents(inputs: LogGteAnalyticsInput[]) {
  if (!inputs.length) return true;
  const first = inputs[0];
  const { userId, req, res } = first;
  try {
    const result = await ingestAnalyticsEvents({
      req,
      res,
      accountId: userId,
      source: "gte_server_log",
      body: {
        events: inputs.map(({ event, eventId, anonId, path, sessionId, timestamp, payload }) => ({
          event_id: eventId,
          anon_id: anonId,
          event,
          path,
          sessionId,
          ts: timestamp,
          payload: payload || {},
        })),
      },
    });
    if (result.written === 0) {
      console.warn(JSON.stringify({
        level: "warn",
        message: "gte_analytics_event_not_written",
        event: inputs.length === 1 ? inputs[0].event : "gte_batch",
        reason: result.reason || "unknown",
        received: result.received,
        blocked: result.blocked,
      }));
    }
    return result.reason !== "posthog_not_configured";
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "gte_analytics_event_failed",
      event: inputs.length === 1 ? inputs[0].event : "gte_batch",
      error_type: error instanceof Error ? error.name : "UnknownError",
    }));
    return false;
  }
}
