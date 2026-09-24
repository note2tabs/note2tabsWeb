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

  it("reports the former Heavy model as Medium", () => {
    expect(getTranscriptionStartedModelEvent("heavy")).toBe(
      ANALYTICS_EVENTS.transcriptionStartedMediumModel
    );
  });

  it("reports the new Heavy model separately", () => {
    expect(getTranscriptionStartedModelEvent("super_heavy")).toBe(
      ANALYTICS_EVENTS.transcriptionStartedHeavyModel
    );
  });
});
