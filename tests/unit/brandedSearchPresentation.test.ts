import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FooterBar from "../../components/FooterBar";
import AboutPage from "../../pages/about";

describe("branded search presentation", () => {
  it("offers Google a stable high-resolution favicon", () => {
    const documentSource = readFileSync(join(process.cwd(), "pages", "_document.tsx"), "utf8");

    expect(documentSource).toContain('sizes="96x96" href="/logo-mark-96.png"');
    expect(documentSource).not.toContain('href="/favicon-32x32.png"');
  });

  it("uses descriptive anchors for the preferred branded sitelinks", () => {
    const html = renderToStaticMarkup(createElement(FooterBar));

    expect(html).toContain('data-nosnippet="true"');
    expect(html).toContain('href="/transcribe">Audio-to-tab transcriber');
    expect(html).toContain('href="/editor">Guitar tab editor');
    expect(html).toContain('href="/pricing">Plans and pricing');
    expect(html).toContain('href="/features">Guitar tab editor features');
    expect(html).toContain('href="/blog">Guitar tab guides');
    expect(html).toContain('href="/audio-to-guitar-tab-converter">Audio to guitar tab converter');
    expect(html).toContain('href="/mp3-to-guitar-tabs">MP3 to guitar tabs');
    expect(html).toContain('href="/ai-guitar-tab-generator">AI guitar tab generator');
  });

  it("keeps the About page title and main heading consistent", () => {
    const html = renderToStaticMarkup(createElement(AboutPage));

    expect(html).toContain("About Note2Tabs");
    expect(html).not.toContain(">About Us<");
  });
});
