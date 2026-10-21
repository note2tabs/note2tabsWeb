// @vitest-environment jsdom
import { act,createElement } from 'react';
import {createRoot} from 'react-dom/client';
import {describe,it,expect,vi} from 'vitest';
const tracked=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/analytics',()=>({trackCtaClick:tracked}));
vi.mock('next/link',()=>({default:({children,...props}:any)=>createElement('a',props,children)}));
import BlogProductLink from '../../components/blog/BlogProductLink';
import ImportExportFeature from '../../components/ImportExportFeature';
import {getSeoFeaturePage} from '../../lib/seoFeaturePages';
import {sanitizeAnalyticsProperties} from '../../lib/analyticsPrivacy';
it('records one article-intro click with the destination and placement surviving privacy filtering',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const el=document.createElement('div');const root=createRoot(el);
 await act(async()=>root.render(createElement(BlogProductLink,{href:'/transcribe?mode=youtube',articleSlug:'youtube-guide',cta:'blog_transcribe',placement:'article_intro'},'Transcribe audio')));
 el.querySelector('a')!.addEventListener('click',e=>e.preventDefault());
 el.querySelector('a')!.click();
 expect(tracked).toHaveBeenCalledTimes(1);
 const [cta,props]=tracked.mock.calls[0];
 expect(cta).toBe('blog_transcribe');
 expect(sanitizeAnalyticsProperties(props)).toMatchObject({article_slug:'youtube-guide',surface:'blog',placement:'article_intro'});
 await act(async()=>root.unmount());
});
it('records feature primary action with the feature identity and clear destination',async()=>{
 tracked.mockClear();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const el=document.createElement('div');const root=createRoot(el);
 await act(async()=>root.render(createElement(ImportExportFeature,{page:getSeoFeaturePage('guitar-tab-import-export')!})));
 const link=el.querySelector<HTMLAnchorElement>('.import-export-header a')!;
 link.addEventListener('click',e=>e.preventDefault());link.click();
 expect(tracked).toHaveBeenCalledExactlyOnceWith('feature_editor',{surface:'feature',feature_slug:'guitar-tab-import-export',destination:'/gte/new',placement:'feature_intro'});
 await act(async()=>root.unmount());
});
