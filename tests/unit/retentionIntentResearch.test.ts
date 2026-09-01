import { describe, expect, it } from "vitest";
import {
  RETENTION_INTENT_DISMISSAL_MS,
  retentionIntentPromptState,
  retentionIntentStorageKey,
  shouldOfferRetentionIntentPrompt,
} from "../../lib/retentionIntentResearch";

describe("retention intent research prompt", () => {
  const now = new Date("2026-08-31T12:00:00.000Z").getTime();

  it("offers the question when the user has not seen it", () => {
    expect(shouldOfferRetentionIntentPrompt(null, now)).toBe(true);
  });

  it("does not ask an answered user again", () => {
    expect(
      shouldOfferRetentionIntentPrompt(retentionIntentPromptState("answered", now), now + 1)
    ).toBe(false);
  });

  it("snoozes a dismissal for 30 days, then permits a new invitation", () => {
    const dismissed = retentionIntentPromptState("dismissed", now);
    expect(shouldOfferRetentionIntentPrompt(dismissed, now + RETENTION_INTENT_DISMISSAL_MS - 1)).toBe(false);
    expect(shouldOfferRetentionIntentPrompt(dismissed, now + RETENTION_INTENT_DISMISSAL_MS)).toBe(true);
  });

  it("isolates the local prompt state by account", () => {
    expect(retentionIntentStorageKey("user-a")).not.toBe(retentionIntentStorageKey("user-b"));
  });

  it("recovers from invalid browser storage", () => {
    expect(shouldOfferRetentionIntentPrompt("not-json", now)).toBe(true);
  });
});
