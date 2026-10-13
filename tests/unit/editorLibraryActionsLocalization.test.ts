import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ALL_LOCALES, type AppLocale } from "../../lib/i18n/locale";
import { translate } from "../../lib/i18n/translate";

const state = vi.hoisted(() => ({ locale: "en" as string }));
vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ locale: state.locale, t: (source: string, values?: Record<string, string>) => translate(source, state.locale as AppLocale, values) }) }));
import EditorLibraryActions from "../../components/EditorLibraryActions";
vi.stubGlobal("React", React);

describe("editor library actions in every supported language", () => {
  it.each(ALL_LOCALES)("renders translated actions and preserves the user's title in %s", locale => {
    state.locale = locale;
    const title = "My song <solo>";
    const html = renderToStaticMarkup(React.createElement(EditorLibraryActions, { editor: { id: "fixture", name: title }, open: true, onOpenChange: () => {}, onUpdated: () => {} }));
    expect(html.match(/role="menuitem"/g)).toHaveLength(3);
    expect(html).toContain("My song &lt;solo&gt;");
    for (const source of ["Rename", "Delete", "Export", "Save tab name", "Cancel", "Track", "Tab name", "Loading…"]) {
      const localized = translate(source, locale);
      expect(localized).not.toContain("{value");
      if (locale !== "en") expect(localized).not.toBe(source);
    }
    for (const source of ["Rename", "Delete", "Export"]) expect(html).toContain(translate(source, locale));
  });
});
