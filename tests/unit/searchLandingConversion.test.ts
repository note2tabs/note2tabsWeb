// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const tracked = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics", () => ({ trackCtaClick: tracked }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
import { ALL_LOCALES, localeHref } from "../../lib/i18n/locale";
import { LocaleProvider } from "../../lib/i18n/react";
import { catalogs } from "../../lib/i18n/translate";
import { loadPublicCatalog } from "../../lib/i18n/publicCatalogs";
import { sanitizeAnalyticsProperties } from "../../lib/analyticsPrivacy";
import Mp3Page from "../../pages/mp3-to-guitar-tabs";
import AudioPage from "../../pages/audio-to-guitar-tab-converter";
import YoutubePage from "../../pages/youtube-to-guitar-tabs";
import AiPage from "../../pages/ai-guitar-tab-generator";
import MakerPage from "../../pages/free-guitar-tab-maker";
import { PLAN_CATALOG } from "../../lib/subscriptionPlans";

const pages = [
  [Mp3Page, "/mp3-to-guitar-tabs", "/transcribe"],
  [AudioPage, "/audio-to-guitar-tab-converter", "/transcribe"],
  [YoutubePage, "/youtube-to-guitar-tabs", "/transcribe?mode=youtube"],
  [AiPage, "/ai-guitar-tab-generator", "/transcribe"],
  [MakerPage, "/free-guitar-tab-maker", "/gte/new"],
] as const;
beforeEach(async () => {
  await Promise.all(ALL_LOCALES.map(loadPublicCatalog));
  for (const flag of ["PT_BR", "ES", "JA", "KO", "PL", "AR", "ZH_HANS", "FR", "IT"]) vi.stubEnv(`NEXT_PUBLIC_${flag}_AVAILABLE`, "true");
  tracked.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe.each(ALL_LOCALES)("%s search intent", locale => {
  it.each(pages)("routes the primary action to the relevant product on %s", (Page, path, destination) => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, {
      path: localeHref(path, locale), children: createElement(Page),
    }));
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector(".search-landing-primary")?.getAttribute("href")).toBe(localeHref(destination, locale));
    expect(document.querySelector(".search-landing-note")?.textContent).toBe(catalogs[locale][destination === "/gte/new" ? "Guest mode" : "Free to try"]);
    expect(document.querySelector(".search-landing-score img")?.getAttribute("alt")).toBe(catalogs[locale]["Example tab in the Note2Tabs editor"]);
    const isTranscription = destination.startsWith("/transcribe");
    expect(Boolean(document.querySelector(".search-transcription-wave"))).toBe(isTranscription);
    if (isTranscription) {
      expect(document.querySelector(".search-transcription-source")?.textContent).toContain(catalogs[locale]["Guitar recording"]);
      expect(document.querySelector(".search-transcription-direction")?.textContent).toContain(catalogs[locale]["Audio → editable tabs"]);
      expect(document.querySelector(".search-landing-score img")?.getAttribute("src")).toContain("guitar-transcription-tab.svg");
    }
    expect(document.querySelectorAll("details").length).toBeGreaterThan(0);
    expect(html).not.toContain("seo-landing-resource-card");
    expect(html).not.toContain("within the first ten minutes");
  });
});

it("records one click with page identity, placement and destination surviving privacy filtering", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement("div");
  const root = createRoot(element);
  await act(async () => root.render(createElement(YoutubePage)));
  const link = element.querySelector<HTMLAnchorElement>(".search-landing-primary")!;
  link.addEventListener("click", event => event.preventDefault());
  link.click();
  expect(tracked).toHaveBeenCalledTimes(1);
  expect(tracked.mock.calls[0][0]).toBe("seo_transcribe");
  expect(sanitizeAnalyticsProperties(tracked.mock.calls[0][1])).toMatchObject({
    surface: "seo_landing", destination: "/transcribe?mode=youtube", placement: "search_hero", landing_path: "/youtube-to-guitar-tabs",
  });
  await act(async () => root.unmount());
});

it("keeps YouTube clip-length advice consistent with the current plan limits", () => {
  const html = renderToStaticMarkup(createElement(YoutubePage));
  expect(html).toContain(`Premium: ${PLAN_CATALOG.PREMIUM.youtubePositionLimitSeconds / 60} minutes.`);
  expect(html).toContain(`Pro: ${PLAN_CATALOG.PRO.youtubePositionLimitSeconds / 60} minutes.`);
  expect(html).not.toContain("10:00");
});
