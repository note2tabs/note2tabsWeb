import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ALL_LOCALES,localeHref} from '../../lib/i18n/locale';
import {LocaleProvider} from '../../lib/i18n/react';
import {catalogs} from '../../lib/i18n/translate';
import ImportExportFeature from '../../components/ImportExportFeature';
import {getSeoFeaturePage} from '../../lib/seoFeaturePages';
beforeEach(()=>{for(const flag of ['PT_BR','ES','JA','KO','PL','AR','ZH_HANS','FR','IT'])vi.stubEnv(`NEXT_PUBLIC_${flag}_AVAILABLE`,'true');});
afterEach(()=>vi.unstubAllEnvs());
const escaped=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
describe.each(ALL_LOCALES)('%s product entry',locale=>{
 it('localizes the format reference and keeps the product destination in the chosen language',()=>{
 const html=renderToStaticMarkup(createElement(LocaleProvider,{path:localeHref('/features/guitar-tab-import-export',locale),children:createElement(ImportExportFeature,{page:getSeoFeaturePage('guitar-tab-import-export')!})}));
 for(const key of ['Supported formats','Format','Import','Export','ASCII tab','Open the editor'])expect(html).toContain(escaped(catalogs[locale][key]));
 expect(html).toContain(`href="${localeHref('/editor',locale)}"`);
 expect(html).toContain('.note2tabs.json');
 expect(html).not.toContain('feature-story-window');
 });
});
