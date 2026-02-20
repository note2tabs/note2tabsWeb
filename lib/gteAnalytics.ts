import { prisma } from "./prisma";

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
};

export async function logGteAnalyticsEvent(input: LogGteAnalyticsInput) {
  const { userId, event, path, sessionId, payload } = input;
  try {
    await prisma.analyticsEvent.create({
      data: {
        userId,
        sessionId,
        event,
        path,
        payload: payload ? JSON.stringify(payload) : undefined,
      },
    });
  } catch (error) {
    console.error("gte analytics event error", error);
  }
}
