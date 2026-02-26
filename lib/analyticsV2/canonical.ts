export const LEGACY_TO_CANONICAL_EVENT_NAME: Record<string, string> = {
  page_view: "page_viewed",
  transcribe_start: "transcription_started",
  transcribe_success: "transcription_succeeded",
  transcribe_error: "transcription_failed",
  gte_editor_visit: "gte_editor_viewed",
  gte_editor_session_start: "gte_session_started",
  gte_editor_session_end: "gte_session_ended",
  gte_editor_created: "gte_editor_created",
};

export const CANONICAL_TO_LEGACY_EVENT_NAME: Record<string, string> = {
  page_viewed: "page_view",
  transcription_started: "transcription_started",
  transcription_succeeded: "transcription_completed",
  transcription_failed: "transcription_failed",
  gte_editor_viewed: "gte_editor_visit",
  gte_session_started: "gte_editor_session_start",
  gte_session_ended: "gte_editor_session_end",
  gte_editor_created: "gte_editor_created",
};

export function toCanonicalName(name: string): { name: string; legacyEventName?: string } {
  const mapped = LEGACY_TO_CANONICAL_EVENT_NAME[name];
  if (!mapped) {
    return { name };
  }
  return {
    name: mapped,
    legacyEventName: name,
  };
}

export function toLegacyName(name: string, legacyEventName?: string | null): string {
  if (legacyEventName && legacyEventName.trim()) return legacyEventName;
  return CANONICAL_TO_LEGACY_EVENT_NAME[name] || name;
}

export const GTE_SESSION_STARTED_EVENT = "gte_session_started";
export const GTE_SESSION_ENDED_EVENT = "gte_session_ended";
