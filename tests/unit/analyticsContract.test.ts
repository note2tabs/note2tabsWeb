import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS } from "../../lib/analytics";
import { GTE_ANALYTICS_EVENTS } from "../../lib/gteAnalytics";

describe("analytics taxonomy contract", () => {
  it("does not assign two product concepts to the same event name", () => {
    const names = Object.values(ANALYTICS_EVENTS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps every editor event unique and in the gte namespace", () => {
    expect(new Set(GTE_ANALYTICS_EVENTS).size).toBe(GTE_ANALYTICS_EVENTS.length);
    expect(GTE_ANALYTICS_EVENTS.every((name) => name.startsWith("gte_"))).toBe(true);
  });

  it("keeps critical funnel outcomes in the published taxonomy", () => {
    expect(Object.values(ANALYTICS_EVENTS)).toEqual(
      expect.arrayContaining([
        "transcription_started",
        "transcription_succeeded",
        "transcription_failed",
        "checkout_session_requested",
        "checkout_started",
        "subscription_started",
      ])
    );
    expect(GTE_ANALYTICS_EVENTS).toEqual(
      expect.arrayContaining([
        "gte_editor_saved",
        "gte_editor_exported",
        "gte_playback_started",
        "gte_practice_started",
      ])
    );
  });
});
