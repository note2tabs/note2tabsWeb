// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/head", () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) }));
vi.mock("../../lib/prisma", () => ({ prisma: { post: { findMany: vi.fn().mockResolvedValue([]) } } }));
import EditorPage from "../../pages/bass-tab-editor";
import TranscriptionPage from "../../pages/audio-to-bass-tabs";
import { LocaleProvider } from "../../lib/i18n/react";
import { ALL_LOCALES, localeHref, localePrefix } from "../../lib/i18n/locale";
import { loadPublicCatalog } from "../../lib/i18n/publicCatalogs";
import { catalogs } from "../../lib/i18n/translate";
import { getServerSideProps as sitemap } from "../../pages/sitemap.xml";

const pages = [[EditorPage, "/bass-tab-editor"], [TranscriptionPage, "/audio-to-bass-tabs"]] as const;
beforeEach(async () => {
  await Promise.all(ALL_LOCALES.map(loadPublicCatalog));
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  for (const flag of ["PT_BR", "ES", "JA", "KO", "PL", "AR", "ZH_HANS", "FR", "IT"]) {
    vi.stubEnv(`NEXT_PUBLIC_${flag}_REVIEWED`, "true");
    vi.stubEnv(`NEXT_PUBLIC_${flag}_AVAILABLE`, "true");
  }
});
afterEach(() => vi.unstubAllEnvs());

function visibleStrings(value: unknown): string[] {
  if (typeof value === "string") return value.startsWith("/") ? [] : [value];
  if (Array.isArray(value)) return value.flatMap(visibleStrings);
  if (value && typeof value === "object") return Object.entries(value)
    .filter(([key]) => !["src", "href", "canonicalPath"].includes(key)).flatMap(([, value]) => visibleStrings(value));
  return [];
}

describe.each(ALL_LOCALES)("%s bass pages", locale => {
  it.each(pages)("fully translates the page and its search metadata for %s", (Page, path) => {
    const props = Page().props;
    const html = renderToStaticMarkup(React.createElement(LocaleProvider, { path: localeHref(path, locale), children: React.createElement(Page) }));
    const doc = new DOMParser().parseFromString(html, "text/html");
    const dictionary = catalogs[locale];
    for (const text of visibleStrings(props)) {
      expect(dictionary[text], `Missing ${locale}: ${text}`).toBeTruthy();
      if (locale !== "en") expect(dictionary[text], text).not.toBe(text);
    }
    expect(doc.querySelector("h1")?.textContent).toBe(dictionary[props.title]);
    expect(doc.querySelector("title")?.textContent).toBe(dictionary[props.metaTitle]);
    expect(doc.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(dictionary[props.description]);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://www.note2tabs.com" + localeHref(path, locale));
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute("content")).toMatch(/^index,/);
    expect(doc.querySelectorAll('link[rel="alternate"]')).toHaveLength(11);
    expect(doc.querySelectorAll("details")).toHaveLength(6);
    const schemas = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(el => JSON.parse(el.textContent || "{}"));
    const faq = schemas.find(schema => schema["@type"] === "FAQPage");
    expect(faq.mainEntity[0].name).toBe(dictionary[props.faqs[0].question]);
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe(dictionary[props.faqs[0].answer]);
    expect(doc.querySelector(".search-landing-primary")?.getAttribute("href")).toBe(localeHref(props.primaryCta.href, locale));
    const other = path === "/bass-tab-editor" ? "/audio-to-bass-tabs" : "/bass-tab-editor";
    expect(doc.querySelector(".search-landing-alternative")?.getAttribute("href")).toBe(localeHref(other, locale));
    if (locale !== "en") expect(existsSync(`pages${localePrefix(locale)}${path}.tsx`)).toBe(true);
    if (locale === "zh-Hans") {
      // A related link to the six-string guitar editor is valid; bass copy is not six-line notation.
      doc.querySelector(".search-landing-related")?.remove();
      expect(doc.querySelector("main")?.textContent).not.toContain("六线谱");
    }
  });
});

it("lists all 20 bass URLs exactly once, with reciprocal language alternates", async () => {
  const write = vi.fn();
  await sitemap({ res: { setHeader: vi.fn(), write, end: vi.fn() } } as any);
  const xml = new DOMParser().parseFromString(write.mock.calls[0][0], "text/xml");
  for (const locale of ALL_LOCALES) for (const [, path] of pages) {
    const url = "https://www.note2tabs.com" + localeHref(path, locale);
    const entries = Array.from(xml.querySelectorAll("url")).filter(entry => entry.querySelector("loc")?.textContent === url);
    expect(entries).toHaveLength(1);
    expect(entries[0].getElementsByTagName("xhtml:link")).toHaveLength(11);
    expect(entries[0].querySelector("lastmod")?.textContent).toBe("2026-10-22T00:00:00.000Z");
  }
});
