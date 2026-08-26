import { describe, expect, it } from "vitest";
import { parseStoredTabPayload, serializeStoredTabPayload } from "../../lib/storedTabs";

describe("stored tab payloads", () => {
  it("preserves multipleGuitars false", () => {
    const resultJson = serializeStoredTabPayload({
      tabs: [["e|--0--|"]],
      transcriberSegments: [],
      backendJobId: "job-123",
      multipleGuitars: false,
    });

    const parsed = parseStoredTabPayload(resultJson);

    expect(parsed.multipleGuitars).toBe(false);
  });

  it("preserves named instrument tracks and drum metadata", () => {
    const resultJson = serializeStoredTabPayload({
      tabs: [],
      transcriberSegments: [],
      transcriberTracks: [
        {
          name: "Lead Synth",
          trackType: "tab",
          instrumentId: "gm:synth-lead",
          program: 80,
          segments: [{ start_time_s: 0, end_time_s: 0.5, pitch_midi: 64, amplitude: 0.7, pitch_bend: [0, 1] }],
        },
        {
          name: "Drums",
          trackType: "drums",
          instrumentId: "drum1",
          segments: [{ start_time_s: 0, end_time_s: 0.1, pitch_midi: 38 }],
        },
      ],
    });

    expect(parseStoredTabPayload(resultJson).transcriberTracks).toEqual([
      expect.objectContaining({
        name: "Lead Synth",
        instrumentId: "gm:synth-lead",
        program: 80,
        trackType: "tab",
        segments: [expect.objectContaining({ amplitude: 0.7, pitch_bend: [0, 1] })],
      }),
      expect.objectContaining({ name: "Drums", instrumentId: "drum1", trackType: "drums" }),
    ]);
  });
});
