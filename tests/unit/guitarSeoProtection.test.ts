import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../../lib/prisma", () => ({ prisma: { post: { findMany: vi.fn() } } }));
import { prisma } from "../../lib/prisma";
import { getBlogPrimaryAction, getBlogProductPaths } from "../../lib/blogProductPaths";
import BlogIndex from "../../pages/blog";
import { getServerSideProps as sitemap } from "../../pages/sitemap.xml";
import { getServerSideProps as rss } from "../../pages/blog/rss.xml";
import { ALL_LOCALES, localeHref } from "../../lib/i18n/locale";

afterEach(() => vi.unstubAllEnvs());
describe("guitar SEO protection during instrument expansion", () => {
  it.each([
    ['youtube-to-guitar-tabs-workflow','Guitar tabs with piano and drums','/transcribe?mode=youtube','/youtube-to-guitar-tabs'],
    ['mp3-to-guitar-tabs','Guitar, bass and drums from MP3','/transcribe','/mp3-to-guitar-tabs'],
    ['how-to-write-guitar-tabs','Arrange guitar with a piano accompaniment','/gte/new','/gte/new'],
    ['guitar-pro-alternative-online','Piano and drum tracks in guitar arrangements','/gte/new','/gte/new'],
    ['how-to-convert-audio-to-guitar-tabs','Hear bass and piano behind the guitar','/transcribe','/audio-to-guitar-tab-converter'],
  ])("keeps %s guitar-owned even when its title mentions another instrument",(slug,title,primary,related)=>{
    expect(getBlogPrimaryAction(slug,title).href).toBe(primary);
    expect(getBlogProductPaths(slug,title)[0].href).toBe(related);
  });
  it("keeps the established blog introduction and guitar posts before new instrument groups",()=>{
    const post={id:'guitar-post',slug:'guitar-tab-editor',title:'Existing guitar guide',excerpt:'Guitar writing',coverImageUrl:null,publishedAt:null,readingMinutes:3,categories:[],tags:[],clusters:[]};
    const html=renderToStaticMarkup(createElement(BlogIndex,{posts:[post],pillars:[post],categories:[],tags:[],total:1,page:1,pageCount:1,activeCategory:null,activeTag:null}));
    expect(html).toContain('Ideas and practical guides for guitarists');
    expect(html).toContain('Thoughtful guides on hearing, writing, transcribing, and practising music on guitar.');
    expect(html.lastIndexOf('href="/blog/guitar-tab-editor"')).toBeLessThan(html.indexOf('id="instrument-guides-title"'));
  });
  it("retains every established guitar product URL and its released language sitemap variants",async()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('VERCEL_ENV','production');
    vi.mocked(prisma.post.findMany).mockResolvedValue([]);
    const res={setHeader:vi.fn(),write:vi.fn(),end:vi.fn()};
    await sitemap({res} as never);
    const xml=res.write.mock.calls[0][0] as string;
    for(const path of ['/','/editor','/transcribe','/audio-to-guitar-tab-converter','/mp3-to-guitar-tabs','/youtube-to-guitar-tabs','/ai-guitar-tab-generator','/free-guitar-tab-maker','/features/guitar-tab-import-export']) {
      for(const locale of ALL_LOCALES)expect(xml).toContain(`<loc>https://www.note2tabs.com${localeHref(path,locale)}</loc>`);
    }
  });
  it("does not evict the existing 50 article entries from RSS when adding instrument guides",async()=>{
    const posts=Array.from({length:50},(_,i)=>({title:`Guitar guide ${i}`,slug:`existing-guitar-guide-${i}`,excerpt:'Guitar guide',publishedAt:new Date('2026-09-01'),publishAt:null,updatedAt:new Date('2026-09-01')}));
    vi.mocked(prisma.post.findMany).mockResolvedValue(posts as never);
    const res={setHeader:vi.fn(),write:vi.fn(),end:vi.fn()};
    await rss({res,resolvedUrl:'/blog/rss.xml'} as never);
    const xml=res.write.mock.calls[0][0] as string;
    for(const post of posts)expect(xml).toContain(`<link>https://www.note2tabs.com/blog/${post.slug}</link>`);
    expect(xml).toContain('/blog/how-to-write-piano-music-notation-online');
  });
});
