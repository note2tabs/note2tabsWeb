import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {ALL_LOCALES, localeAnalytics, localeCohort, localeHref} from "../../lib/i18n/locale";
import {flowMessages} from "../../lib/i18n/flowMessages";
import {translate} from "../../lib/i18n/translate";
import {sanitizeAnalyticsProperties} from "../../lib/analyticsPrivacy";

const placeholders = (value: string) => (value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || []).sort();
describe("localization audit invariants", () => {
  it("shows the required deletion literal in the actual form and placeholder", () => {
    const settings = readFileSync("pages/settings.tsx", "utf8");
    expect(settings).toContain('<strong dir="ltr">delete</strong>');
    expect(settings).toContain('placeholder="delete"');
    expect(settings).not.toContain('t("delete")');
  });
  it.each(ALL_LOCALES)("keeps complete %s catalogs and functional literals", locale => {
    for (const group of ["", "editor/"]) {
      const source = JSON.parse(readFileSync(`lib/i18n/${group}en.json`, "utf8"));
      const messages = JSON.parse(readFileSync(`lib/i18n/${group}${locale}.json`, "utf8"));
      expect(Object.keys(messages).sort()).toEqual(Object.keys(source).sort());
      for (const [key, value] of Object.entries(messages) as [string, string][]) {
        expect(value.trim(), `${locale}: ${key}`).not.toBe("");
        expect(placeholders(value), `${locale}: ${key}`).toEqual(placeholders(key));
        expect(value, key).not.toMatch(/\uFFFD|▁/);
        // Extensions are functional instructions, not words to translate.
        for (const token of key.match(/(?<!\w)\.(?:txt|tab|asc|musicxml|xml|mid|midi|gp3|gp4|gp5|gpx|gtp|mxl)\b/g) || [])
          expect(value, `${locale}: ${key}`).toContain(token);
      }
      if (!group) {
        expect(messages['Type "delete" to confirm permanent account deletion.']).toContain("delete");
        expect(messages["Type delete to confirm"]).toContain("delete");
      } else {
        for (const token of ["MThd", "MTrk", "KeyD", "KeyS", "Shift+S", "Ctrl/Cmd+←/→"])
          expect(messages[token], `${locale}: ${token}`).toBe(token);
      }
    }
  });
  it.each(ALL_LOCALES)("renders full %s sentences without losing names, counts or placeholders", locale => {
    expect(Object.keys(flowMessages[locale])).toEqual(Object.keys(flowMessages.en));
    for (const [key, value] of Object.entries(flowMessages[locale])) {
      expect(placeholders(value), key).toEqual(placeholders(key));
      const rendered = translate(key, locale, {plan: "Premium", count: 3, percent: 20, size: 200, seconds: 30, minutes: 10, date: "2026-10-17"});
      expect(rendered).not.toMatch(/\{[a-zA-Z]/);
      if (key.includes("{plan}")) expect(rendered).toContain("Premium");
      if (key.includes("{count}")) expect(rendered).toContain("3");
      if (key.includes("{percent}")) expect(rendered).toContain("20");
    }
    expect(translate("Getting {plan} ready…", "ja", {plan: "Premium"}).startsWith("Premium")).toBe(true);
  });
  it.each(ALL_LOCALES)("keeps %s page and country attribution distinct after privacy sanitization", locale => {
    const page = localeHref("/transcribe", locale);
    const properties = sanitizeAnalyticsProperties({...localeAnalytics(page), ...localeCohort(locale, "BR"), pathname: page, blocked_reason: "file_too_large"});
    expect(properties).toMatchObject({content_locale: locale, visitor_country: "BR", visitor_market: "brazil", pathname: page, blocked_reason: "file_too_large"});
    expect(properties.locale_version).toBeTruthy();
  });
});
