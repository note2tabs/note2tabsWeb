import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("transcriber SEO experiment", () => {
  it("uses a clear transcription search snippet on the homepage", () => {
    const homepage = readSource("pages/index.tsx");

    expect(homepage).toContain(
      'title="AI Guitar Tab Generator – Audio & YouTube to Tabs | Note2Tabs"'
    );
    expect(homepage).toContain(
      "Upload an MP3 or WAV, or paste a YouTube link to generate playable guitar tabs online."
    );
  });

  it("links each major transcription source to its dedicated converter page", () => {
    const homepage = readSource("pages/index.tsx");

    expect(homepage).toContain('<Link href="/mp3-to-guitar-tabs">');
    expect(homepage).toContain('<Link href="/audio-to-guitar-tab-converter">');
    expect(homepage).toContain('<Link href="/youtube-to-guitar-tabs">');
    expect(homepage).toContain('<Link href="/ai-guitar-tab-generator">');
  });
});
