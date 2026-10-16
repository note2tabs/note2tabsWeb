import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {ALL_LOCALES, localeHref} from "../../lib/i18n/locale";
import {LocaleProvider} from "../../lib/i18n/react";
import {translate} from "../../lib/i18n/translate";
import HeavyPreviewIntroDialog from "../../components/HeavyPreviewIntroDialog";
import HeavyPreviewOffer from "../../components/HeavyPreviewOffer";
import HeavyPreviewEditorPrompt from "../../components/HeavyPreviewEditorPrompt";
import PostLightModelPrompt from "../../components/PostLightModelPrompt";

vi.stubGlobal("React", React);
const noop = () => {};
const copy = "This will use your account’s only free Heavy model transcription on 30 seconds of this recording. The Heavy model is normally available only with Premium or Pro.";
describe("model trial and upgrade localization", () => {
  it.each(ALL_LOCALES)("renders %s trial terms and every action variant in the selected language", locale => {
    const render = (children: React.ReactNode) => renderToStaticMarkup(React.createElement(LocaleProvider, {path: localeHref("/transcribe", locale), children}));
    const asText = (value: string) => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
    const intro = render(React.createElement(HeavyPreviewIntroDialog, {open: true, onCancel: noop, onConfirm: noop}));
    for (const key of [copy, "Use your free Heavy model preview?", "Not yet", "Use my preview"])
      expect(intro).toContain(asText(translate(key, locale)));
    expect(intro).toContain('role="dialog"');
    expect(intro).toContain('aria-modal="true"');
    expect(translate(copy, locale)).toContain("30");
    expect(translate(copy, locale)).toContain("Premium");
    expect(translate(copy, locale)).toContain("Pro");
    const offer = render(React.createElement(HeavyPreviewOffer, {selected: false, onSelect: noop}));
    expect(offer).toContain(asText(translate("Try Heavy", locale)));
    const selected = render(React.createElement(HeavyPreviewOffer, {selected: true, onSelect: noop}));
    expect(selected).toContain('aria-pressed="true"');
    expect(selected).toContain(asText(translate("Selected", locale)));
    const editor = render(React.createElement(HeavyPreviewEditorPrompt, {open: true, onClose: noop, onUpgrade: noop}));
    expect(editor).toContain(asText(translate("Your preview used our most accurate model. Continue using it with Premium or Pro.", locale)));
    for (const [recommendation, hasHeavyAccess, action] of [["heavy_preview", false, "Try Heavy free"], ["heavy", false, "See Heavy plans"], ["heavy", true, "Try Heavy"]] as const) {
      const prompt = render(React.createElement(PostLightModelPrompt, {open: true, recommendation, hasHeavyAccess, onClose: noop, onTryAgain: noop}));
      expect(prompt).toContain(asText(translate(action, locale)));
      if (recommendation === "heavy_preview") expect(prompt).toContain(asText(translate("One preview per account · No credits used", locale)));
      else expect(prompt).not.toContain(asText(translate("One preview per account · No credits used", locale)));
    }
    if (locale !== "en") expect(intro).not.toContain(copy);
  });
  it("keeps closed prompts absent", () => {
    expect(renderToStaticMarkup(React.createElement(HeavyPreviewIntroDialog, {open: false, onCancel: noop, onConfirm: noop}))).toBe("");
    expect(renderToStaticMarkup(React.createElement(PostLightModelPrompt, {open: false, recommendation: "heavy", onClose: noop, onTryAgain: noop}))).toBe("");
  });
});
