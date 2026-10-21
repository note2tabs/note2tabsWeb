import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AiGuitarTabGeneratorPage, {
  AI_GENERATOR_META_TITLE,
} from "../../pages/ai-guitar-tab-generator";
import AudioToGuitarTabConverterPage from "../../pages/audio-to-guitar-tab-converter";
import Mp3ToGuitarTabsPage from "../../pages/mp3-to-guitar-tabs";
import YoutubeToGuitarTabsPage from "../../pages/youtube-to-guitar-tabs";

describe("Search Console opportunity pages", () => {
  it("positions the AI generator as structured transcription connected to a complete editor", () => {
    const html = renderToStaticMarkup(createElement(AiGuitarTabGeneratorPage));

    expect(html).toContain("AI Guitar Tab Generator from Audio or YouTube");
    expect(AI_GENERATOR_META_TITLE).toBe(
      "Free AI Guitar Tab Generator | Audio & YouTube"
    );
    expect(html).toContain("Try an AI guitar tab generator free");
    expect(html).toContain("From a recording to an editable guitar tab");
    expect(html).toContain("Try the AI guitar tab generator free on a short section");
    expect(html).toContain("Is the AI guitar tab generator free?");
    expect(html).toContain("/features");
    expect(html).not.toContain("draft");
    expect(html).not.toContain("rough");
  });

  it("differentiates the audio product workflow from the editorial guide", () => {
    const html = renderToStaticMarkup(createElement(AudioToGuitarTabConverterPage));

    expect(html).not.toContain("Converter or guide: choose the right page");
    expect(html).toContain("Which recordings convert best?");
    expect(html).toContain("/blog/how-to-convert-audio-to-guitar-tabs");
    expect(html).toContain("Can I convert an MP3 to guitar tabs for free?");
  });

  it("explains the focused YouTube workflow and links to its supporting guide", () => {
    const html = renderToStaticMarkup(createElement(YoutubeToGuitarTabsPage));

    expect(html).toContain("YouTube to Guitar Tabs Converter");
    expect(html).not.toContain("Why the homepage and this converter serve different jobs");
    expect(html).not.toContain("within the first ten minutes");
    expect(html).toContain("Your clip can start anywhere in the video.");
    expect(html).toContain("Turn a YouTube riff or solo into an editable tab");
    expect(html).toContain("/blog/youtube-to-guitar-tabs-workflow");
  });

  it("gives free tab-maker searches a substantial standalone editor path", async () => {
    const { default: FreeGuitarTabMakerPage } = await import("../../pages/free-guitar-tab-maker");
    const html = renderToStaticMarkup(createElement(FreeGuitarTabMakerPage));

    expect(html).toContain("A free online tab maker built for guitar");
    expect(html).toContain("Start a blank tab");
    expect(html).toContain('href="/editor"');
    expect(html).toContain('href="/features"');
  });

  it("gives MP3 searches a substantial product page with conversion paths", () => {
    const html = renderToStaticMarkup(createElement(Mp3ToGuitarTabsPage));

    expect(html).toContain("MP3 to Guitar Tabs Converter");
    expect(html).toContain("How to get a clearer MP3-to-tab conversion");
    expect(html).toContain("Can I convert an MP3 to guitar tabs for free?");
    expect(html).toContain('href="/transcribe"');
    expect(html).toContain('href="/editor"');
    expect(html).toContain('href="/audio-to-guitar-tab-converter"');
  });
});
