import { describe, expect, it } from "vitest";
import {
  RETENTION_RESEARCH_VERSION,
  buildTranscriptionResearchProperties,
} from "../../lib/retentionResearch";

describe("retention research transcription properties", () => {
  it("normalizes dimensions used for model and outcome comparisons", () => {
    expect(buildTranscriptionResearchProperties({
      mode: "FILE",
      transcriptionModel: "heavy",
      separateGuitar: true,
      multipleGuitars: false,
      durationSec: 91.4,
      fileSizeBytes: 12_345.4,
      appendingToExistingEditor: true,
    })).toEqual({
      research_version: RETENTION_RESEARCH_VERSION,
      mode: "FILE",
      input_source: "local_file",
      transcriptionModel: "heavy",
      separate_guitar: true,
      multiple_guitars: false,
      duration_sec: 91.4,
      durationSec: 91.4,
      file_size_bytes: 12_345,
      appending_to_existing_editor: true,
    });
  });

  it("omits invalid optional measurements without breaking analytics", () => {
    const properties = buildTranscriptionResearchProperties({
      mode: "YOUTUBE",
      transcriptionModel: "light",
      separateGuitar: false,
      multipleGuitars: true,
      durationSec: Number.NaN,
      fileSizeBytes: null,
    });

    expect(properties.input_source).toBe("youtube");
    expect(properties.duration_sec).toBeUndefined();
    expect(properties.durationSec).toBeUndefined();
    expect(properties.file_size_bytes).toBeUndefined();
  });
});
