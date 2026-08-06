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
  path?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
  req?: NextApiRequest;
  res?: NextApiResponse;
};

export async function logGteAnalyticsEvent(input: LogGteAnalyticsInput) {
  const { userId, event, path, sessionId, payload, req, res } = input;
  try {
    const result = await ingestAnalyticsEvents({
      req,
      res,
      accountId: userId,
      source: "gte_server_log",
      body: {
        event,
        path,
        sessionId,
        payload: payload || {},
      },
    });
    if (result.written === 0) {
      console.warn(JSON.stringify({
        level: "warn",
        message: "gte_analytics_event_not_written",
        event,
        reason: result.reason || "unknown",
        received: result.received,
        blocked: result.blocked,
      }));
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "gte_analytics_event_failed",
      event,
      error_type: error instanceof Error ? error.name : "UnknownError",
    }));
  }
}
