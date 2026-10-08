import {afterEach, describe, expect, it, vi} from "vitest";
import {LOCALIZED_PUBLIC_PATHS, localeHref, localeSwitchHref, supportsLocalizedPath} from "../../lib/i18n/locale";
import {withPortuguesePilot, withPortugueseStaticPage} from "../../lib/i18n/pilot";
import {articleTranslation, localizeBlogProps, portuguesePosts} from "../../lib/i18n/blog/localize";
import {relativeUpdatedAt} from "../../lib/i18n/dates";
vi.mock("../../lib/prisma", () => ({prisma: {}}));
afterEach(() => vi.unstubAllEnvs());
describe("Portuguese site navigation", () => {
 it("covers public and account pages while leaving the interactive editor English", () => {
  for (const path of [...LOCALIZED_PUBLIC_PATHS, "/features/guitar-tab-practice-trainer", "/blog/mp3-to-guitar-tabs", "/blog/category/guitar-tabs", "/settings", "/home", "/shared", "/tabs/private/edit", "/email/unsubscribe?token=opaque"]) {
   expect(supportsLocalizedPath(path)).toBe(true);
   expect(localeHref(path,"pt-BR")).toBe(`/pt-br${path === "/" ? "" : path}`);
   expect(localeHref(localeHref(path,"pt-BR"),"en")).toBe(path);
  }
  for(const path of ["/gte", "/gte/guest", "/api/account", "/admin/blog"]) expect(localeHref(path,"pt-BR")).toBe(path);
 });
 it("keeps authentication and opaque parameters intact in server redirects", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  const loader=vi.fn().mockResolvedValue({redirect: {destination:"/auth/login?next=%2Ftabs%2Fprivate%3FappendEditorId%3Dopaque", permanent:false}});
  const result=await withPortuguesePilot(loader)({resolvedUrl:"/pt-br/tabs/private",req:{headers:{}},res:{setHeader:vi.fn()}} as any);
  expect(result).toHaveProperty("redirect");
  if("redirect" in result) {
   const url=new URL(result.redirect.destination,"https://example.com");
   expect(url.pathname).toBe("/pt-br/auth/login");
   expect(url.searchParams.get("next")).toBe("/pt-br/tabs/private?appendEditorId=opaque");
  }
  expect(localeSwitchHref("https://stripe.com/billing", "pt-BR")).toBe("https://stripe.com/billing");
  expect(localeSwitchHref("/settings?callbackUrl=https%3A%2F%2Fevil.example", "pt-BR")).toContain("callbackUrl=https%3A%2F%2Fevil.example");
 });
 it("adapts static loaders without returning ISR fields or bypassing the release gate",async () => {
  const loader=vi.fn().mockResolvedValue({props:{page:"feature"},revalidate:3600});
  const context={resolvedUrl:"/pt-br/features/example",req:{headers:{}},res:{setHeader:vi.fn()}} as any;
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED","false");
  expect(await withPortugueseStaticPage(loader)(context)).toEqual({notFound:true});expect(loader).not.toHaveBeenCalled();
  vi.stubEnv("VERCEL_ENV","preview");
  expect(await withPortugueseStaticPage(loader)(context)).toEqual({props:{page:"feature",initialDisplayCurrency:"USD"}});
 });
});
describe("Portuguese published articles", () => {
 it("compiles every translated article with working localized links and table of contents", async () => {
  expect(Object.keys(portuguesePosts)).toHaveLength(26);
  for(const [slug,row]of Object.entries(portuguesePosts)) {
   const result=await localizeBlogProps({post:{slug,title:row.sourceTitle,updatedAt:row.sourceUpdatedAt,contentHtml:"English",authorName:"Original Author"},toc:[]});
   const post=result.post as any;
   expect(post.contentLanguage,slug).toBe("pt-BR");expect(post.title).toBe(row.title);expect(post.authorName).toBe("Original Author");
   expect(post.contentHtml).not.toBe("English");expect(post.contentHtml).not.toMatch(/href="\/(editor|transcribe|blog|auth)\b/);
   for(const heading of result.toc as any[]) expect(post.contentHtml).toContain(`id="${heading.id}"`);
   expect(post.contentHtml).not.toContain("<script");
  }
 },30000);
 it("does not serve stale translations or rewrite user content",async () => {
  const row=portuguesePosts["mp3-to-guitar-tabs"];
  expect(articleTranslation("mp3-to-guitar-tabs","2099-01-01",row.sourceTitle)).toBeNull();
  const result=await localizeBlogProps({post:{slug:"mp3-to-guitar-tabs",title:row.sourceTitle,updatedAt:"2099-01-01",contentHtml:"Updated original"},user:{name:"My Tab",email:"user@example.com"}});
  expect(result.post).toMatchObject({contentHtml:"Updated original",contentLanguage:"en",title:row.sourceTitle});
  expect(result.user).toEqual({name:"My Tab",email:"user@example.com"});
 });
 it("formats relative activity in the selected language", () => {
  expect(relativeUpdatedAt("2026-10-08T10:00:00Z","pt-BR",Date.parse("2026-10-08T10:05:00Z"))).toBe("há 5 minutos");
  expect(relativeUpdatedAt(undefined,"en")).toBe("Recently edited");
 });
});
