import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import SeoHead from "../../components/SeoHead";
import { LocaleProvider } from "../../lib/i18n/react";
import { getServerSideProps as sitemap } from "../../pages/sitemap.xml";
import { getServerSideProps as transcribe } from "../../pages/pt-br/transcribe";
vi.mock("next/head", () => ({default: ({children}: {children: React.ReactNode}) => React.createElement(React.Fragment, null, children)}));
vi.mock("../../lib/prisma", () => ({prisma: {post: {findMany: vi.fn().mockResolvedValue([])}}}));
vi.mock("../../pages/transcriber", () => ({default: () => null}));
vi.stubGlobal("React", React);
afterEach(() => vi.unstubAllEnvs());

function render(localePath: string, canonicalPath: string) {
  return renderToStaticMarkup(React.createElement(LocaleProvider, {path:localePath, children:React.createElement(SeoHead, {title:"Note2Tabs",canonicalPath})}));
}
describe("Portuguese SEO and route regression", () => {
  it("keeps self canonicals and reciprocal alternates on all reviewed public pairs", () => {
    vi.stubEnv("NODE_ENV","production"); vi.stubEnv("VERCEL_ENV","production"); vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED","true");
    for (const path of ["/","/transcribe","/pricing","/editor","/privacy","/features/guitar-tab-fingering-optimizer"]) {
      const localized = path === "/" ? "/pt-br" : `/pt-br${path}`;
      const en = render(path,path); const pt = render(localized,path);
      expect(en).toContain(`rel="canonical" href="https://www.note2tabs.com${path}"`);
      expect(pt).toContain(`rel="canonical" href="https://www.note2tabs.com${localized}"`);
      for (const html of [en,pt]) {
        expect(html).toContain(`hrefLang="en" href="https://www.note2tabs.com${path}"`);
        expect(html).toContain(`hrefLang="pt-BR" href="https://www.note2tabs.com${localized}"`);
        expect(html).toContain(`hrefLang="x-default" href="https://www.note2tabs.com${path}"`);
      }
    }
  });
  it("does not advertise draft alternatives from English and keeps preview noindex", () => {
    vi.stubEnv("NODE_ENV","production"); vi.stubEnv("VERCEL_ENV","preview"); vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED","true");
    expect(render("/pricing","/pricing")).not.toContain('hrefLang="pt-BR"');
    expect(render("/pt-br/pricing","/pricing")).toContain('content="noindex,follow"');
    expect(render("/editor","/editor")).not.toContain("/pt-br/editor");
  });
  it("annotates enabled public language URLs, excluding private flow pages", async () => {
    vi.stubEnv("NEXT_PUBLIC_ES_REVIEWED","false"); vi.stubEnv("NEXT_PUBLIC_JA_REVIEWED","false");
    vi.stubEnv("NODE_ENV","production"); vi.stubEnv("VERCEL_ENV","production"); vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED","true");
    const write=vi.fn(); const res={setHeader:vi.fn(),write,end:vi.fn()};
    await sitemap({res} as any); const xml=write.mock.calls[0][0] as string;
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    const urls = xml.match(/<url>[\s\S]*?<\/url>/g)!;
    const pairs=urls.filter(url => /<loc>[^<]*\/(pt-br\/)?(pricing|transcribe)<\/loc>|<loc>[^<]*\/(pt-br)?<\/loc>/.test(url));
    expect(pairs).toHaveLength(6);
    for (const entry of pairs) expect(entry).toContain('hreflang="pt-BR"');
    expect(xml).not.toContain("/pt-br/auth/"); expect(xml).toContain("/pt-br/editor");
    vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED","false"); write.mockClear(); await sitemap({res} as any);
    expect(write.mock.calls[0][0]).not.toContain("/pt-br");
  });
  it("renders the Portuguese transcriber instead of inheriting the English legacy redirect", async () => {
    vi.stubEnv("NODE_ENV","production"); vi.stubEnv("VERCEL_ENV","preview");
    const result=await transcribe({resolvedUrl:"/pt-br/transcribe",req:{headers:{}},res:{setHeader:vi.fn()}} as any);
    expect(result).toHaveProperty("props"); expect(result).not.toHaveProperty("redirect");
  });
});
