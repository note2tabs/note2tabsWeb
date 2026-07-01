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
});
