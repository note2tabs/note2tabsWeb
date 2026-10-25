import {describe,it,expect,vi,beforeAll,afterAll} from "vitest";
import {readFileSync,existsSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {JSDOM} from "jsdom";
import {instrumentCatalogs,localizeInstrumentPage,translatedInstrumentPaths} from "../../lib/i18n/instruments";
import {TRANSLATED_LOCALES,localeHref} from "../../lib/i18n/locale";
import {instrumentSeoPages} from "../../lib/instrumentSeoPages";
import {LocaleProvider} from "../../lib/i18n/react";
import {registerPublicCatalog} from "../../lib/i18n/translate";
import SeoLandingPage from "../../components/SeoLandingPage";

vi.mock('next/head',()=>({default:({children}: {children: import('react').ReactNode})=>createElement('div',null,children)}));

describe('instrument landing localization',()=>{
 beforeAll(()=>{for(const key of ['PT_BR','ES','JA','KO','PL','AR','ZH_HANS','FR','IT'])vi.stubEnv(`NEXT_PUBLIC_${key}_AVAILABLE`,'true');});
 afterAll(()=>vi.unstubAllEnvs());
 it('covers every supported non-English language with complete authored catalogs',()=>{
  expect(Object.keys(instrumentCatalogs).sort()).toEqual([...TRANSLATED_LOCALES].sort());
  for(const locale of TRANSLATED_LOCALES){
   const c=instrumentCatalogs[locale]!;
   for(const [key,length] of Object.entries({names:5,titles:6,descriptions:6,actions:6,workflow:6,workflowBodies:6,sections:8,piano:4,drums:2,ukulele:2,hub:10,metaTitles:6,imageAlts:3,drumReview:3,drumEditor:2,ukuleleEditor:2,questions:8,exports:3,recordingLabels:3,resultLabels:3})){
    const entries=c[key as keyof typeof c];
    if(!Array.isArray(entries))throw new Error(`Expected an array for ${locale}:${key}`);
    expect(entries,`${locale}:${key}`).toHaveLength(length);expect(entries.every(value=>value.trim().length>0)).toBe(true);
   }
  }
 });
 for(const locale of TRANSLATED_LOCALES){
  it(`${locale}: preserves instrument intent and serves self-canonical translated editions`,()=>{
   registerPublicCatalog(locale,JSON.parse(readFileSync(`lib/i18n/${locale}.json`,'utf8')));
   for(const [slug,source] of Object.entries(instrumentSeoPages)){
    const before=JSON.stringify(source),page=localizeInstrumentPage(source,locale);
    expect(JSON.stringify(source)).toBe(before);
    expect(page.title).not.toBe(source.title);
    expect(page.primaryCta.href).toBe(source.primaryCta.href);
    expect(page.primaryCta.label).not.toBe(source.primaryCta.label);
    expect(page.hasTranslation).toBe(true);
    expect(page.preview?.src).toBe(source.preview?.src);
    expect(page.preview?.alt).not.toBe(page.description);
    expect(page.metaTitle).toContain(instrumentCatalogs[locale]!.metaTitles[translatedInstrumentPaths.findIndex(p=>p===source.canonicalPath)]);
    expect(page.faqs).toHaveLength(2);
    const path=localeHref(source.canonicalPath,locale);
    expect(existsSync(`pages${path}.tsx`)).toBe(true);
    const html=renderToStaticMarkup(createElement(LocaleProvider,{path,children:createElement(SeoLandingPage,page)}));
    const d=new JSDOM(html).window.document;
    expect(d.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe(`https://www.note2tabs.com${path}`);
    expect(d.querySelector('h1')?.textContent).toBe(page.title);
    expect(d.querySelectorAll('h1')).toHaveLength(1);
    expect(d.querySelectorAll('main')).toHaveLength(1);
    expect(d.querySelector('.search-landing-primary')?.getAttribute('href')).toBe(localeHref(page.primaryCta.href,locale));
    expect(d.querySelector('main')?.textContent).not.toContain(source.description);
    expect(d.querySelector('main')?.textContent).not.toContain('undefined');
    expect(d.querySelectorAll('.search-landing-faq details')).toHaveLength(2);
    const schemas=[...d.querySelectorAll('script[type="application/ld+json"]')].map(el=>JSON.parse(el.textContent||'{}'));
    const faq=schemas.find(item=>item['@type']==='FAQPage');
    expect(faq.mainEntity.map((item:{name:string})=>item.name)).toEqual(page.faqs!.map(faq=>faq.question));
   }
  });
 }
 it('registers the seven new translated routes without claiming translated guide editions',()=>{
  expect(translatedInstrumentPaths).toHaveLength(7);
  for(const locale of TRANSLATED_LOCALES)for(const path of translatedInstrumentPaths)expect(existsSync(`pages${localeHref(path,locale)}.tsx`)).toBe(true);
  for(const page of Object.values(instrumentSeoPages))expect(localizeInstrumentPage(page,'en')).toEqual({...page,hasTranslation:true});
 });
});
