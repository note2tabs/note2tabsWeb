import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS } from "../../lib/analytics";

describe("transcription model analytics", () => {
  it("uses one canonical event segmented by transcriptionModel", () => {
    expect(ANALYTICS_EVENTS.tabGenerationStarted).toBe("transcription_started");
  });
});
