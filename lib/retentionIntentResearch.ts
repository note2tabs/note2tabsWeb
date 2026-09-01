export const RETENTION_INTENT_PROMPT_VERSION = "unactivated_home_v1";
export const RETENTION_INTENT_PROMPT_DELAY_MS = 20_000;
export const RETENTION_INTENT_DISMISSAL_MS = 30 * 24 * 60 * 60 * 1000;
export const RETENTION_INTENT_RESEARCH_ENABLED =
  process.env.NEXT_PUBLIC_RETENTION_INTENT_RESEARCH_ENABLED === "true";

export const RETENTION_INTENT_OPTIONS = [
  { value: "transcribe_recording", label: "Turn a recording into tabs" },
  { value: "write_or_edit_tab", label: "Write or edit my own tab" },
  { value: "practice_tab", label: "Practice a tab" },
  { value: "export_or_share", label: "Export or share tabs" },
  { value: "explore", label: "See what Note2Tabs can do" },
] as const;

export type RetentionIntent = (typeof RETENTION_INTENT_OPTIONS)[number]["value"];

type RetentionIntentPromptState = {
  status: "answered" | "dismissed";
  at: number;
};

export const retentionIntentStorageKey = (userId: string) =>
  `note2tabs:retention-intent:${RETENTION_INTENT_PROMPT_VERSION}:${userId}`;

export function shouldOfferRetentionIntentPrompt(
  storedValue: string | null,
  now = Date.now()
) {
  if (!storedValue) return true;

  try {
    const state = JSON.parse(storedValue) as Partial<RetentionIntentPromptState>;
    if (state.status === "answered") return false;
    if (state.status === "dismissed" && typeof state.at === "number") {
      return now - state.at >= RETENTION_INTENT_DISMISSAL_MS;
    }
  } catch {
    return true;
  }

  return true;
}

export function retentionIntentPromptState(
  status: RetentionIntentPromptState["status"],
  now = Date.now()
) {
  return JSON.stringify({ status, at: now } satisfies RetentionIntentPromptState);
}
