import { ingestAnalyticsEvents } from "./analyticsV2/ingest";
import type { NextApiRequest, NextApiResponse } from "next";

export type GteAnalyticsEvent =
  | "gte_editor_created"
  | "gte_editor_visit"
  | "gte_editor_session_start"
  | "gte_editor_session_end";

type LogGteAnalyticsInput = {
  userId: string;
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
    await ingestAnalyticsEvents({
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
  } catch (error) {
    console.error("gte analytics event error", error);
  }
}
