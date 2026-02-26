import { describe, expect, it } from "vitest";
import { toCanonicalName, toLegacyName } from "../../lib/analyticsV2/canonical";

describe("canonical mapping", () => {
  it("maps legacy names to canonical names", () => {
    const mapped = toCanonicalName("transcribe_start");
    expect(mapped.name).toBe("transcription_started");
    expect(mapped.legacyEventName).toBe("transcribe_start");
  });

  it("keeps canonical names unchanged", () => {
    const mapped = toCanonicalName("transcription_started");
    expect(mapped.name).toBe("transcription_started");
    expect(mapped.legacyEventName).toBeUndefined();
  });

  it("maps canonical names to legacy names for dual write", () => {
    expect(toLegacyName("page_viewed")).toBe("page_view");
    expect(toLegacyName("gte_session_ended")).toBe("gte_editor_session_end");
  });

  it("prefers explicit legacyEventName when present", () => {
    expect(toLegacyName("transcription_started", "transcribe_start")).toBe("transcribe_start");
  });
});
