import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AiGuitarTabGeneratorPage from "../../pages/ai-guitar-tab-generator";
import AudioToGuitarTabConverterPage from "../../pages/audio-to-guitar-tab-converter";
import YoutubeToGuitarTabsPage from "../../pages/youtube-to-guitar-tabs";

describe("Search Console opportunity pages", () => {
  it("positions the AI generator as structured transcription connected to a complete editor", () => {
    const html = renderToStaticMarkup(createElement(AiGuitarTabGeneratorPage));

    expect(html).toContain("AI Guitar Tab Generator from Audio or YouTube");
    expect(html).toContain("What helps the AI capture the most detail?");
    expect(html).toContain("Is the AI guitar tab generator free?");
    expect(html).toContain("/features");
    expect(html).not.toContain("draft");
    expect(html).not.toContain("rough");
  });

  it("differentiates the audio product workflow from the editorial guide", () => {
    const html = renderToStaticMarkup(createElement(AudioToGuitarTabConverterPage));

    expect(html).toContain("Converter or guide: choose the right page");
    expect(html).toContain("/blog/how-to-convert-audio-to-guitar-tabs");
    expect(html).toContain("Can I convert an MP3 to guitar tabs for free?");
  });

  it("explains the focused YouTube workflow and links to its supporting guide", () => {
    const html = renderToStaticMarkup(createElement(YoutubeToGuitarTabsPage));

    expect(html).toContain("YouTube to Guitar Tabs Converter");
    expect(html).toContain("Why the homepage and this converter serve different jobs");
    expect(html).toContain("/blog/youtube-to-guitar-tabs-workflow");
  });
});
