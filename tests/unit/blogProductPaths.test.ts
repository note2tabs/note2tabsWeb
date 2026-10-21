import { describe, expect, it } from "vitest";
import { getBlogProductPaths, getBlogPrimaryAction, directBlogProductLinks } from "../../lib/blogProductPaths";

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

describe("direct product entry", () => {
  it.each([
    ["youtube-to-guitar-tabs", "Guide", "/transcribe?mode=youtube"],
    ["wav-to-guitar-tabs", "Guide", "/transcribe"],
    ["note-to-tab-converter", "Turn notes or audio into tabs", "/editor"],
    ["how-to-edit-guitar-tabs-for-practice", "AI editor", "/editor"],
    ["guitar-pro-alternative-online", "Audio transcription", "/editor"],
  ])("matches %s to the actual task", (slug,title,expected) => {
    expect(getBlogPrimaryAction(slug,title).href).toBe(expected);
  });
  it("corrects only the known misleading tool-labelled blog link and preserves editorial links", () => {
    const tool = '<a href="/blog/how-to-convert-audio-to-guitar-tabs">audio to guitar tab converter</a>';
    expect(directBlogProductLinks(tool,"fr")).toContain('href="/fr/transcribe"');
    const article = '<a href="/blog/how-to-convert-audio-to-guitar-tabs">Read the conversion guide</a>';
    expect(directBlogProductLinks(article,"en")).toBe(article);
    const external = '<a href="https://example.com/blog/how-to-convert-audio-to-guitar-tabs">audio to guitar tab converter</a>';
    expect(directBlogProductLinks(external,"en")).toBe(external);
  });
});
