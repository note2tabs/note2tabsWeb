import {describe, it, expect} from "vitest";
import {languageMismatchTarget, mismatchCopy} from "../../lib/i18n/languageMismatch";
import {ALL_LOCALES} from "../../lib/i18n/locale";
const enabled = () => true;
describe("language mismatch recommendations", () => {
  it.each(ALL_LOCALES)("does not flag a matching %s page", locale => {
    expect(languageMismatchTarget(locale, locale, enabled)).toBeNull();
    expect(mismatchCopy[locale].continue).toBeTruthy();
    expect(mismatchCopy[locale].stay).toBeTruthy();
  });
  it.each(ALL_LOCALES.filter(locale => locale !== "en"))("offers English on %s to an unsupported-language browser", locale => {
    expect(languageMismatchTarget(locale, "vi-VN,vi,en", enabled)).toBe("en");
  });
  it.each(ALL_LOCALES.filter(locale => locale !== "en"))("offers supported %s on English pages", locale => {
    expect(languageMismatchTarget("en", locale, enabled)).toBe(locale);
  });
  it("does not flag English for unsupported or unknown languages", () => {
    expect(languageMismatchTarget("en", "vi-VN", enabled)).toBeNull();
    expect(languageMismatchTarget("fr", "", enabled)).toBeNull();
    expect(languageMismatchTarget("en", "fr", locale => locale === "en")).toBeNull();
  });
  it("respects browser priority and traditional Chinese", () => {
    expect(languageMismatchTarget("fr", "ja-JP,fr;q=0.8", enabled)).toBe("ja");
    expect(languageMismatchTarget("en", "zh-Hant-TW,en", enabled)).toBeNull();
  });
});
