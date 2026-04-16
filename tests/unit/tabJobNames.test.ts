import { describe, expect, it } from "vitest";
import { buildUniqueTabJobLabel, deriveTabJobBaseLabel } from "../../lib/tabJobNames";

describe("tab job naming", () => {
  it("prefers the video title over a YouTube URL", () => {
    const label = deriveTabJobBaseLabel({
      sourceType: "YOUTUBE",
      explicitLabel: "https://www.youtube.com/watch?v=abc123",
      songTitle: "Never Meant",
      artist: "American Football",
      jobId: "job-1",
    });

    expect(label).toBe("American Football - Never Meant");
  });

  it("removes file extensions from uploaded audio filenames", () => {
    const label = deriveTabJobBaseLabel({
      sourceType: "FILE",
      explicitLabel: "C:\\music\\brazil3.wav",
      songTitle: "",
      artist: "",
      jobId: "job-2",
    });

    expect(label).toBe("brazil3");
  });

  it("adds 02-style suffixes for duplicate tab names", () => {
    const label = buildUniqueTabJobLabel("Untitled", ["Untitled", "Untitled02", "Other"]);
    expect(label).toBe("Untitled03");
  });
});
