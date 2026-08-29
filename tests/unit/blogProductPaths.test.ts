import { describe, expect, it } from "vitest";
import { getBlogProductPaths } from "../../lib/blogProductPaths";

describe("blog product paths", () => {
  it.each([
    ["youtube-to-guitar-tabs-workflow", "/youtube-to-guitar-tabs"],
    ["mp3-to-guitar-tabs", "/mp3-to-guitar-tabs"],
    ["best-ai-guitar-tab-generator", "/ai-guitar-tab-generator"],
    ["how-to-convert-audio-to-guitar-tabs", "/audio-to-guitar-tab-converter"],
    ["how-to-write-guitar-tabs", "/editor"],
  ])("maps %s to its intended product page", (slug, expectedPath) => {
    expect(getBlogProductPaths(slug, "Guide")[0]?.href).toBe(expectedPath);
  });

  it("uses descriptive, distinct anchors", () => {
    const paths = getBlogProductPaths("youtube-tabs", "YouTube tabs");
    expect(paths.map((path) => path.label)).toEqual([
      "YouTube to guitar tabs converter",
      "Online guitar tab editor",
    ]);
  });
});
