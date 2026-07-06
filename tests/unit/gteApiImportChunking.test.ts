import { describe, expect, it } from "vitest";
import {
  chunkTranscriberSegmentGroups,
  TRANSCRIBER_IMPORT_CHUNK_MAX_BYTES,
  TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS,
  type TranscriberSegmentGroup,
} from "../../lib/gteApi";

function buildGroup(index: number): TranscriberSegmentGroup {
  return [
    {
      start_time_s: index,
      end_time_s: index + 0.25,
      pitch_midi: 52 + (index % 12),
      amplitude: 0.8,
    },
  ];
}

describe("transcriber import chunking", () => {
  it("keeps request chunks under the configured byte and group budgets", () => {
    const groups = Array.from({ length: TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS * 3 + 5 }, (_, index) =>
      buildGroup(index)
    );

    const chunks = chunkTranscriberSegmentGroups(groups);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toHaveLength(groups.length);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS);
      expect(JSON.stringify(chunk).length).toBeLessThanOrEqual(TRANSCRIBER_IMPORT_CHUNK_MAX_BYTES);
    }
  });
});
