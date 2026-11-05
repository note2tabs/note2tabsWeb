import {afterEach, describe, expect, it, vi} from "vitest";
import {runInNewContext} from "node:vm";
import {createHash} from "node:crypto";
import assets from "../../lib/i18n/publicCatalogAssets.json";
import {readFileSync} from "node:fs";
import {flowMessages} from "../../lib/i18n/flowMessages";
import {languagePreferenceMessages} from "../../lib/i18n/languagePreferenceMessages";
import {publicMessagesForDocument} from "../../lib/i18n/publicCatalogs.server";
import {ALL_LOCALES} from "../../lib/i18n/locale";

function browserMessages(locale = "en", messages: Record<string,string> = {}) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {getElementById: () => ({textContent: JSON.stringify({locale,messages})})});
}
afterEach(() => {vi.unstubAllGlobals(); vi.resetModules();});

describe("public language catalogs", () => {
  it("boots every content-hashed catalog before hydration with complete messages", async () => {
    for (const locale of ALL_LOCALES) {
      vi.resetModules();
      const source=readFileSync(`public${assets[locale]}`,"utf8");
      expect(assets[locale]).toContain(createHash("sha256").update(source).digest("hex").slice(0,16));
      const browser:any={};runInNewContext(source,{window:browser});
      vi.stubGlobal("window",browser);vi.stubGlobal("document",{getElementById:()=>null});
      const {catalogs,hasPublicCatalog}=await import("../../lib/i18n/translate");
      expect(hasPublicCatalog(locale)).toBe(true);
      expect(catalogs[locale]).toMatchObject(JSON.parse(publicMessagesForDocument(locale)).messages);
    }
  });
  it("starts the browser with only the server-rendered language", async () => {
    browserMessages("fr", {"Upload audio": "Importer un fichier audio"});
    const {translate,hasPublicCatalog} = await import("../../lib/i18n/translate");
    expect(translate("Upload audio", "fr")).toBe("Importer un fichier audio");
    expect(ALL_LOCALES.filter(hasPublicCatalog)).toEqual(["fr"]);
  });

  it("loads every language on demand and retains editor messages", async () => {
    browserMessages();
    const {translate,hasPublicCatalog,registerEditorCatalog,catalogs} = await import("../../lib/i18n/translate");
    const {loadPublicCatalog} = await import("../../lib/i18n/publicCatalogs");
    registerEditorCatalog("fr", {"Editor-only fixture": "Message de l’éditeur"});
    for (const locale of ALL_LOCALES.filter(locale => locale !== "en")) {
      const first=loadPublicCatalog(locale);
      expect(loadPublicCatalog(locale)).toBe(first);
      await first;
      expect(hasPublicCatalog(locale)).toBe(true);
      const expected=JSON.parse(readFileSync(new URL(`../../lib/i18n/${locale}.json`, import.meta.url), "utf8"));
      expect(catalogs[locale]).toMatchObject({...expected, ...languagePreferenceMessages[locale], ...flowMessages[locale]});
    }
    expect(translate("Editor-only fixture", "fr")).toBe("Message de l’éditeur");
  });

  it("embeds only the current catalog and preserves English overrides", () => {
    for (const locale of ALL_LOCALES) {
      const serialized=publicMessagesForDocument(locale);
      const payload=JSON.parse(serialized);
      expect(payload.locale).toBe(locale);
      expect(serialized).not.toContain("<");
      const expected=JSON.parse(readFileSync(new URL(`../../lib/i18n/${locale}.json`, import.meta.url), "utf8"));
      expect(payload.messages).toEqual(locale === "en" ? Object.fromEntries(Object.entries(expected).filter(([key,value])=>key!==value)) : expected);
    }
  });

  it("keeps all server translations available during SSR", async () => {
    const {hasPublicCatalog,catalogs} = await import("../../lib/i18n/translate");
    expect(ALL_LOCALES.every(hasPublicCatalog)).toBe(true);
    for(const locale of ALL_LOCALES) expect(Object.keys(catalogs[locale]).length).toBeGreaterThan(1000);
  });
});
