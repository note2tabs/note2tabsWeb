import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  getAcceptedTranscriptionAccessType,
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

  it("classifies an accepted Heavy preview separately from paid usage", () => {
    expect(getAcceptedTranscriptionAccessType(true, false)).toBe("preview");
    expect(getAcceptedTranscriptionAccessType(true, true)).toBe("preview");
    expect(getAcceptedTranscriptionAccessType(false, true)).toBe("paid");
    expect(getAcceptedTranscriptionAccessType(false, false)).toBe("free");
    expect(getAcceptedTranscriptionAccessType(false, false, true)).toBe("staff");
  });
});
