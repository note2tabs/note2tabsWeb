import { describe, expect, it, vi } from 'vitest';
const posts = vi.hoisted(() => ({findMany: vi.fn()}));
vi.mock('../../lib/prisma',()=>({prisma:{post:posts}}));
import {getServerSideProps} from '../../pages/sitemap.xml';
import {articleLocales} from '../../lib/i18n/blog/availability';
import {localizeBlogProps} from '../../lib/i18n/blog/localize';
import fr from '../../lib/i18n/blog/fr/mp3-to-guitar-tabs.json';

describe('French and Italian article SEO',()=>{
 it('advertises complete translated articles reciprocally in the sitemap',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_FR_REVIEWED','true');vi.stubEnv('NEXT_PUBLIC_IT_REVIEWED','true');
  posts.findMany.mockResolvedValue([{slug:'mp3-to-guitar-tabs',updatedAt:new Date(fr.sourceUpdatedAt)}]);
  const res={setHeader:vi.fn(),write:vi.fn(),end:vi.fn()};
  await getServerSideProps({res} as any);
  const xml=res.write.mock.calls[0][0];
  for(const locale of ['fr','it']){
   expect(xml).toContain(`/${locale}/blog/mp3-to-guitar-tabs</loc>`);
   expect(xml).toContain(`hreflang="${locale}"`);
  }
  expect(xml).not.toContain('/fr/blog/not-yet-translated-article');
  vi.unstubAllEnvs();
 });
 it('never advertises stale French or Italian text after a source edit',async()=>{
  expect(articleLocales('mp3-to-guitar-tabs','2099-01-01')).not.toContain('fr');
  expect(articleLocales('mp3-to-guitar-tabs','2099-01-01')).not.toContain('it');
  for(const locale of ['fr','it'] as const){
   const result=await localizeBlogProps({post:{slug:'mp3-to-guitar-tabs',title:fr.sourceTitle,updatedAt:'2099-01-01',contentLanguage:'en',contentHtml:'New English source'}},locale);
   expect(result.post.contentLanguage).toBe('en');
  }
 });
});
