import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TRANSLATED_LOCALES, localeHref } from "../../lib/i18n/locale";
import { articleLocales } from "../../lib/i18n/blog/availability";
import { articleTranslation, localizeBlogProps } from "../../lib/i18n/blog/localize";
import { instrumentGuides } from "../../lib/instrumentGuideIndex";
import { localizedGuideTools } from "../../lib/i18n/instrumentGuides/tools";
import { instrumentGuideProps } from "../../lib/instrumentGuides";
import { localizedInstrumentGuideGroups, instrumentGuideMetadata } from "../../lib/i18n/instrumentGuides";
import { LocaleProvider } from "../../lib/i18n/react";
import { registerPublicCatalog } from "../../lib/i18n/translate";
import BlogPostPage, { getStaticProps } from "../../pages/blog/[slug]";
import { getServerSideProps as sitemap } from "../../pages/sitemap.xml";
import { getServerSideProps as rss } from "../../pages/blog/rss.xml";

const db = vi.hoisted(() => ({findFirst: vi.fn(() => {throw new Error("Static guide must not query the database");}), findMany: vi.fn(async () => [])}));
vi.mock("../../lib/prisma", () => ({prisma: {post: db}}));
vi.mock("next/head", () => ({default: ({children}: {children: import("react").ReactNode}) => createElement("div", null, children)}));
const coreSlugs = Object.keys(instrumentGuideMetadata.es!);
const sourceDate = "2026-10-25T00:00:00.000Z";

beforeAll(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  for (const key of ["PT_BR", "ES", "JA", "KO", "PL", "AR", "ZH_HANS", "FR", "IT"]) {
    vi.stubEnv(`NEXT_PUBLIC_${key}_AVAILABLE`, "true");
    vi.stubEnv(`NEXT_PUBLIC_${key}_REVIEWED`, "true");
  }
  for (const locale of TRANSLATED_LOCALES) registerPublicCatalog(locale, JSON.parse(readFileSync(`lib/i18n/${locale}.json`, "utf8")));
});
afterAll(() => vi.unstubAllEnvs());

describe("localized core instrument guides", () => {
  it("loads static guides through the dynamic route used by localized pages without querying Neon", async () => {
    for (const slug of coreSlugs) {
      const result = await getStaticProps({params: {slug}});
      expect("props" in result).toBe(true);
    }
    expect(db.findFirst).not.toHaveBeenCalled();
  });

  for (const locale of TRANSLATED_LOCALES) {
    it(`${locale}: serves real translated articles with matching canonicals, alternates, dates and tool links`, async () => {
      expect(localizedInstrumentGuideGroups(locale).map(group => group.instrument)).toEqual(["piano", "bass", "drums", "ukulele"]);
      for (const slug of coreSlugs) {
        const source = await instrumentGuideProps(slug);
        if (!source.props) throw Error("Missing guide");
        const row = articleTranslation(slug, source.props.post.updatedAt, source.props.post.title, locale)!;
        expect(row).not.toBeNull();
        expect(instrumentGuideMetadata[locale]![slug]).toEqual({title: row.title, excerpt: row.excerpt, sourceUpdatedAt: row.sourceUpdatedAt});
        expect(articleLocales(slug, sourceDate)).toContain(locale);
        expect(row.title).not.toBe(source.props.post.title);
        expect(articleTranslation(slug, "2099-01-01T00:00:00.000Z", undefined, locale)).toBeNull();
        const props = await localizeBlogProps(source.props, locale);
        const html = renderToStaticMarkup(createElement(LocaleProvider, {
          path: localeHref(`/blog/${slug}`, locale), children: createElement(BlogPostPage, props),
        }));
        const doc = new JSDOM(html).window.document;
        expect(doc.querySelectorAll("h1")).toHaveLength(1);
        expect(doc.querySelector("h1")!.textContent).toBe(row.title);
        expect(doc.querySelector(".post-prose")!.getAttribute("lang")).toBe(locale);
        expect(doc.querySelector(".post-prose")!.getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");
        expect(doc.querySelector(".post-entry-action a")!.textContent).toContain(localizedGuideTools(slug, locale)!.transcribe.label);
        expect(doc.querySelectorAll(".post-prose h2")).toHaveLength(6);
        expect(doc.querySelector('link[rel="canonical"]')!.getAttribute("href")).toBe(`https://www.note2tabs.com${localeHref(`/blog/${slug}`, locale)}`);
        expect(doc.querySelectorAll('link[rel="alternate"][hreflang]')).toHaveLength(11);
        expect(doc.querySelector('meta[name="robots"]')!.getAttribute("content")).not.toContain("noindex");
        expect(html).toContain("2026-10-31T00:00:00.000Z");
        expect(html).not.toContain("This article is currently available in English.");
        const links = [...doc.querySelectorAll<HTMLAnchorElement>(".post-prose a")].map(a => a.getAttribute("href")!);
        expect(links.some(href => href.startsWith("/gte/new?track="))).toBe(true);
        expect(links.some(href => href.startsWith(`/${locale.toLowerCase()}/`))).toBe(true);
        expect(links.some(href => href.includes("guitar"))).toBe(false);
      }
    });
  }

  it("never advertises the eleven guides still awaiting translation", () => {
    const untranslated = instrumentGuides.filter(guide => !coreSlugs.includes(guide.slug));
    expect(untranslated).toHaveLength(11);
    for (const guide of untranslated) expect(articleLocales(guide.slug, sourceDate)).toEqual([]);
  });

  it("submits every authored guide edition once with reciprocal hreflang and no invented editions", async () => {
    let body = "";
    await sitemap({res: {setHeader: vi.fn(), write: (text: string) => {body += text;}, end: vi.fn()}} as any);
    const doc = new JSDOM(body, {contentType: "application/xml"}).window.document;
    expect(doc.querySelector("parsererror")).toBeNull();
    const urls = [...doc.querySelectorAll("url")];
    const locs = urls.map(url => url.querySelector("loc")!.textContent!);
    expect(new Set(locs).size).toBe(locs.length);
    for (const slug of coreSlugs) for (const locale of ["en", ...TRANSLATED_LOCALES] as const) {
      const loc = `https://www.note2tabs.com${localeHref(`/blog/${slug}`, locale)}`;
      const entry = urls.find(url => url.querySelector("loc")!.textContent === loc)!;
      expect(entry, loc).toBeDefined();
      expect(entry.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "link")).toHaveLength(11);
    }
    for (const guide of instrumentGuides.filter(guide => !coreSlugs.includes(guide.slug))) {
      expect(locs).toContain(`https://www.note2tabs.com/blog/${guide.slug}`);
      expect(locs).not.toContain(`https://www.note2tabs.com/ja/blog/${guide.slug}`);
    }
  });

  it("includes the translated guides in localized RSS with localized links and titles", async () => {
    for (const locale of TRANSLATED_LOCALES) {
      let body = "";
      await rss({resolvedUrl: localeHref("/blog/rss.xml", locale), res: {
        setHeader: vi.fn(), write: (text: string) => {body += text;}, end: vi.fn(),
      }} as any);
      const doc = new JSDOM(body, {contentType: "application/xml"}).window.document;
      expect(doc.querySelector("parsererror")).toBeNull();
      expect(doc.querySelectorAll("item")).toHaveLength(4);
      for (const slug of coreSlugs) expect(body).toContain(localeHref(`/blog/${slug}`, locale));
    }
  });
});
