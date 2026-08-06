import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  getTranscriptionStartedModelEvent,
} from "../../lib/analytics";

describe("transcription model analytics", () => {
  it("selects the light-model started event", () => {
    expect(getTranscriptionStartedModelEvent("light")).toBe(
      ANALYTICS_EVENTS.transcriptionStartedLightModel
    );
  });

  it("selects the heavy-model started event", () => {
    expect(getTranscriptionStartedModelEvent("heavy")).toBe(
      ANALYTICS_EVENTS.transcriptionStartedHeavyModel
    );
  });
});
