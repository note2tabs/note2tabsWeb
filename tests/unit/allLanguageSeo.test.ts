import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";
import SeoHead from "../../components/SeoHead";
import {LocaleProvider} from "../../lib/i18n/react";
import {ALL_LOCALES, LOCALIZED_PUBLIC_PATHS, localeHref} from "../../lib/i18n/locale";
import {INDEXABLE_BLOG_CLUSTERS} from "../../lib/blogIndexPolicy";
import {seoFeaturePages} from "../../lib/seoFeaturePages";
import {translate} from "../../lib/i18n/translate";
import {getServerSideProps as sitemap} from "../../pages/sitemap.xml";
vi.mock("next/head",()=>({default:({children}:{children:React.ReactNode})=>React.createElement(React.Fragment,null,children)}));
vi.mock("../../lib/prisma",()=>({prisma:{post:{findMany:vi.fn().mockResolvedValue([])}}}));
vi.stubGlobal("React",React);
afterEach(()=>vi.unstubAllEnvs());
const flags=["PT_BR","ES","JA","KO","PL","AR","ZH_HANS","FR","IT"];
function production(){vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");for(const flag of flags)vi.stubEnv(`NEXT_PUBLIC_${flag}_REVIEWED`,"true");}
function head(path:string,canonicalPath:string,extra={}){return renderToStaticMarkup(React.createElement(LocaleProvider,{path,children:React.createElement(SeoHead,{title:"Audio to Guitar Tab Converter",description:"Convert audio to playable, editable guitar tabs online. Upload MP3, WAV, M4A, or FLAC, generate tablature, then practise, edit, and export it.",canonicalPath,...extra})}));}
const paths=[...LOCALIZED_PUBLIC_PATHS.filter(p=>p!=="/online-guitar-tab-editor"),...seoFeaturePages.map(p=>`/features/${p.slug}`),...Array.from(INDEXABLE_BLOG_CLUSTERS,slug=>`/blog/cluster/${slug}`)];
describe("all-language search discoverability",()=>{
 it.each(ALL_LOCALES)("keeps %s public pages self-canonical with reciprocal language links",locale=>{
  production();
  for(const path of paths){
   const html=head(localeHref(path,locale),path);
   expect(html).toContain(`rel="canonical" href="https://www.note2tabs.com${localeHref(path,locale)}"`);
   expect(html).toContain('content="index,follow,max-image-preview:large');
   for(const other of ALL_LOCALES)expect(html).toContain(`hrefLang="${other}" href="https://www.note2tabs.com${localeHref(path,other)}"`);
   expect(html).toContain(`hrefLang="x-default" href="https://www.note2tabs.com${path}"`);
   expect(html).not.toContain("?utm_");
  }
 });
 it.each(ALL_LOCALES)("renders %s titles, descriptions and schema in the content language",locale=>{
  production();const path=localeHref('/audio-to-guitar-tab-converter',locale);
  const html=head(path,'/audio-to-guitar-tab-converter',{jsonLd:{'@type':'WebPage',name:'Audio to Guitar Tab Converter',inLanguage:'en',url:'https://www.note2tabs.com/audio-to-guitar-tab-converter'}});
  const title=translate('Audio to Guitar Tab Converter',locale);
  expect(html).toContain(`<title>${title}</title>`);
  expect(html).toContain(`"inLanguage":"${locale}"`);
  expect(html).toContain(`"url":"https://www.note2tabs.com${path}"`);
  if(locale!=='en')expect(html).not.toContain('content="Convert audio to playable');
 });
 it("includes all enabled canonical product URLs and alternates in the sitemap",async()=>{
  production();const write=vi.fn();await sitemap({res:{setHeader:vi.fn(),write,end:vi.fn()}} as any);
  const xml=write.mock.calls[0][0] as string;
  for(const locale of ALL_LOCALES)for(const path of paths.filter(p=>p!=='/internship-application'))expect(xml).toContain(`<loc>https://www.note2tabs.com${localeHref(path,locale)}</loc>`);
  for(const locale of ALL_LOCALES)expect(xml).not.toContain(`${localeHref('/auth/signup',locale)}</loc>`);
  expect(xml).not.toContain('/online-guitar-tab-editor');
  expect(xml).toContain('<lastmod>2026-10-16T00:00:00.000Z</lastmod>');
 });
 it("keeps disabled editions out of search alternates and the sitemap",async()=>{
  production();vi.stubEnv('NEXT_PUBLIC_FR_REVIEWED','false');vi.stubEnv('NEXT_PUBLIC_IT_REVIEWED','false');
  expect(head('/','/')).not.toMatch(/hrefLang="(?:fr|it)"/);
  for(const locale of ['fr','it'] as const)expect(head(`/${locale}`,'/')).toContain('content="noindex,follow"');
  const write=vi.fn();await sitemap({res:{setHeader:vi.fn(),write,end:vi.fn()}} as any);
  expect(write.mock.calls[0][0]).not.toMatch(/<loc>https:\/\/www.note2tabs.com\/(?:fr|it)(?:<|\/)/);
 });
 it("does not advertise untranslated article variants",()=>{
  production();const html=head('/ja/blog/example','/blog/example',{translatedLocales:['ja']});
  expect(html).toContain('hrefLang="ja"');expect(html).not.toContain('hrefLang="fr"');
  expect(head('/fr/blog/example','/blog/example',{contentLocale:'en',hasTranslation:false,noindex:true})).not.toContain('hrefLang=');
 });
 it("preserves the established Brazilian search copy",()=>{
  const source=JSON.parse(readFileSync('lib/i18n/pt-BR.json','utf8'));
  expect(source['AI Guitar Tab Generator – Audio & YouTube to Tabs | Note2Tabs']).toBe('Gerador de tablaturas com IA — Áudio e YouTube | Note2Tabs');
 });
});
