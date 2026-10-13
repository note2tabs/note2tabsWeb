import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "../../lib/i18n/translate";
import type { AppLocale } from "../../lib/i18n/locale";

const state = vi.hoisted(() => ({ locale: "ko" as string }));
vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (source: string) => translate(source, state.locale as AppLocale) }) }));
import MonthlyCredits from "../../components/MonthlyCredits";

afterEach(() => { state.locale = "ko"; });
describe("monthly credit descriptions", () => {
  it.each([
    ["ko", "매월 <strong>100</strong> 크레딧"],
    ["ja", "毎月<strong>100</strong>クレジット"],
    ["zh-Hans", "每月 <strong>100</strong> 积分"],
  ])("renders the number in the grammatical position for %s", (locale, expected) => {
    state.locale = locale;
    expect(renderToStaticMarkup(createElement(MonthlyCredits, { count: 100 }))).toBe(expected);
  });
  it("keeps the comparison in the same translated phrase", () => {
    const html = renderToStaticMarkup(createElement(MonthlyCredits, { count: 100, tenTimesMore: true }));
    expect(html).toBe("매월 <strong>100</strong> 크레딧 — 10배 더 많이");
    expect(html).not.toContain("{count}");
  });
});
