import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_EVENTS,
  getAcceptedTranscriptionAccessType,
  getTranscriptionStartedModelEvent,
  sendTranscriptionStartedEvents,
} from "../../lib/analytics";

const capture = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analyticsV2", () => ({ track: capture }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); capture.mockClear(); });

describe("transcription model analytics", () => {
  it("captures both start events with the implementation id, overriding stale properties", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("window", { location: { search: "" } });
    sendTranscriptionStartedEvents("light", { transcriptionModel: "light", model: "light", jobId: "job-new" });
    expect(capture.mock.calls.map(([event]) => event)).toEqual([
      "transcription_started", "transcription_started_msmodel_small",
    ]);
    for (const [, properties] of capture.mock.calls) {
      expect(properties).toMatchObject({ model: "msmodel_small", transcriptionModel: "msmodel_small", transcription_model_id: "msmodel_small", transcription_backend_method: "msmodel_small", jobId: "job-new" });
    }
  });
  it("selects the light-model started event", () => {
    expect(getTranscriptionStartedModelEvent("light")).toBe(
      ANALYTICS_EVENTS.transcriptionStartedMuScriptorSmallModel
    );
  });

  it("never emits the historical Basic Pitch start event for new Light", () => {
    expect(getTranscriptionStartedModelEvent("light")).not.toBe(ANALYTICS_EVENTS.transcriptionStartedLightModel);
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
