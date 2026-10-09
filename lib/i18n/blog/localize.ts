import { compilePostContent } from "../../blogContent";
import { estimateReadingTime } from "../../blog";
import { localeHref, type AppLocale } from "../locale";
import post0 from "./pt-BR/ai-guitar-tab-editor.json";
import post1 from "./pt-BR/ai-guitar-tab-generator-convert-any-song-even-youtube-into-tabs.json";
import post2 from "./pt-BR/ascii-guitar-tab-editor.json";
import post3 from "./pt-BR/free-online-guitar-tab-maker.json";
import post4 from "./pt-BR/guitar-fingering-optimizer.json";
import post5 from "./pt-BR/guitar-pro-alternative-online.json";
import post6 from "./pt-BR/guitar-solo-tab-maker.json";
import post7 from "./pt-BR/guitar-tab-creator-with-playback.json";
import post8 from "./pt-BR/guitar-tab-editor.json";
import post9 from "./pt-BR/guitar-tab-maker-vs-guitar-tab-editor.json";
import post10 from "./pt-BR/how-to-convert-audio-to-guitar-tabs.json";
import post11 from "./pt-BR/how-to-edit-guitar-tabs-for-practice.json";
import post12 from "./pt-BR/how-to-fix-ai-guitar-tabs.json";
import post13 from "./pt-BR/how-to-learn-guitar-faster-using-ai-tools.json";
import post14 from "./pt-BR/how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes.json";
import post15 from "./pt-BR/how-to-use-generate-cuts-cut-regions-and-optimize.json";
import post16 from "./pt-BR/how-to-write-guitar-tabs-online-without-downloading-software.json";
import post17 from "./pt-BR/manual-vs-ai-guitar-transcription-which-is-better-for-guitar-players.json";
import post18 from "./pt-BR/mp3-to-guitar-tabs.json";
import post19 from "./pt-BR/note-to-tab-converter-how-to-turn-guitar-notes-into-tablature-online.json";
import post20 from "./pt-BR/song-to-guitar-tabs.json";
import post21 from "./pt-BR/tab-editor-for-guitar.json";
import post22 from "./pt-BR/the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly.json";
import post23 from "./pt-BR/wav-to-guitar-tabs.json";
import post24 from "./pt-BR/why-guitar-tabs-can-be-wrong.json";
import post25 from "./pt-BR/youtube-to-guitar-tabs-workflow.json";

import esPost0 from "./es/ai-guitar-tab-editor.json";
import esPost1 from "./es/ai-guitar-tab-generator-convert-any-song-even-youtube-into-tabs.json";
import esPost2 from "./es/ascii-guitar-tab-editor.json";
import esPost3 from "./es/free-online-guitar-tab-maker.json";
import esPost4 from "./es/guitar-fingering-optimizer.json";
import esPost5 from "./es/guitar-pro-alternative-online.json";
import esPost6 from "./es/guitar-solo-tab-maker.json";
import esPost7 from "./es/guitar-tab-creator-with-playback.json";
import esPost8 from "./es/guitar-tab-editor.json";
import esPost9 from "./es/guitar-tab-maker-vs-guitar-tab-editor.json";
import esPost10 from "./es/how-to-convert-audio-to-guitar-tabs.json";
import esPost11 from "./es/how-to-edit-guitar-tabs-for-practice.json";
import esPost12 from "./es/how-to-fix-ai-guitar-tabs.json";
import esPost13 from "./es/how-to-learn-guitar-faster-using-ai-tools.json";
import esPost14 from "./es/how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes.json";
import esPost15 from "./es/how-to-use-generate-cuts-cut-regions-and-optimize.json";
import esPost16 from "./es/how-to-write-guitar-tabs-online-without-downloading-software.json";
import esPost17 from "./es/manual-vs-ai-guitar-transcription-which-is-better-for-guitar-players.json";
import esPost18 from "./es/mp3-to-guitar-tabs.json";
import esPost19 from "./es/note-to-tab-converter-how-to-turn-guitar-notes-into-tablature-online.json";
import esPost20 from "./es/song-to-guitar-tabs.json";
import esPost21 from "./es/tab-editor-for-guitar.json";
import esPost22 from "./es/the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly.json";
import esPost23 from "./es/wav-to-guitar-tabs.json";
import esPost24 from "./es/why-guitar-tabs-can-be-wrong.json";
import esPost25 from "./es/youtube-to-guitar-tabs-workflow.json";
import jaPost0 from "./ja/ai-guitar-tab-editor.json";
import jaPost1 from "./ja/ai-guitar-tab-generator-convert-any-song-even-youtube-into-tabs.json";
import jaPost2 from "./ja/ascii-guitar-tab-editor.json";
import jaPost3 from "./ja/free-online-guitar-tab-maker.json";
import jaPost4 from "./ja/guitar-fingering-optimizer.json";
import jaPost5 from "./ja/guitar-pro-alternative-online.json";
import jaPost6 from "./ja/guitar-solo-tab-maker.json";
import jaPost7 from "./ja/guitar-tab-creator-with-playback.json";
import jaPost8 from "./ja/guitar-tab-editor.json";
import jaPost9 from "./ja/guitar-tab-maker-vs-guitar-tab-editor.json";
import jaPost10 from "./ja/how-to-convert-audio-to-guitar-tabs.json";
import jaPost11 from "./ja/how-to-edit-guitar-tabs-for-practice.json";
import jaPost12 from "./ja/how-to-fix-ai-guitar-tabs.json";
import jaPost13 from "./ja/how-to-learn-guitar-faster-using-ai-tools.json";
import jaPost14 from "./ja/how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes.json";
import jaPost15 from "./ja/how-to-use-generate-cuts-cut-regions-and-optimize.json";
import jaPost16 from "./ja/how-to-write-guitar-tabs-online-without-downloading-software.json";
import jaPost17 from "./ja/manual-vs-ai-guitar-transcription-which-is-better-for-guitar-players.json";
import jaPost18 from "./ja/mp3-to-guitar-tabs.json";
import jaPost19 from "./ja/note-to-tab-converter-how-to-turn-guitar-notes-into-tablature-online.json";
import jaPost20 from "./ja/song-to-guitar-tabs.json";
import jaPost21 from "./ja/tab-editor-for-guitar.json";
import jaPost22 from "./ja/the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly.json";
import jaPost23 from "./ja/wav-to-guitar-tabs.json";
import jaPost24 from "./ja/why-guitar-tabs-can-be-wrong.json";
import jaPost25 from "./ja/youtube-to-guitar-tabs-workflow.json";
export const portuguesePosts = {
  "ai-guitar-tab-editor": post0,
  "ai-guitar-tab-generator-convert-any-song-even-youtube-into-tabs": post1,
  "ascii-guitar-tab-editor": post2,
  "free-online-guitar-tab-maker": post3,
  "guitar-fingering-optimizer": post4,
  "guitar-pro-alternative-online": post5,
  "guitar-solo-tab-maker": post6,
  "guitar-tab-creator-with-playback": post7,
  "guitar-tab-editor": post8,
  "guitar-tab-maker-vs-guitar-tab-editor": post9,
  "how-to-convert-audio-to-guitar-tabs": post10,
  "how-to-edit-guitar-tabs-for-practice": post11,
  "how-to-fix-ai-guitar-tabs": post12,
  "how-to-learn-guitar-faster-using-ai-tools": post13,
  "how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes": post14,
  "how-to-use-generate-cuts-cut-regions-and-optimize": post15,
  "how-to-write-guitar-tabs-online-without-downloading-software": post16,
  "manual-vs-ai-guitar-transcription-which-is-better-for-guitar-players": post17,
  "mp3-to-guitar-tabs": post18,
  "note-to-tab-converter-how-to-turn-guitar-notes-into-tablature-online": post19,
  "song-to-guitar-tabs": post20,
  "tab-editor-for-guitar": post21,
  "the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly": post22,
  "wav-to-guitar-tabs": post23,
  "why-guitar-tabs-can-be-wrong": post24,
  "youtube-to-guitar-tabs-workflow": post25,
};
export const spanishPosts = {
  "ai-guitar-tab-editor": esPost0,
  "ai-guitar-tab-generator-convert-any-song-even-youtube-into-tabs": esPost1,
  "ascii-guitar-tab-editor": esPost2,
  "free-online-guitar-tab-maker": esPost3,
  "guitar-fingering-optimizer": esPost4,
  "guitar-pro-alternative-online": esPost5,
  "guitar-solo-tab-maker": esPost6,
  "guitar-tab-creator-with-playback": esPost7,
  "guitar-tab-editor": esPost8,
  "guitar-tab-maker-vs-guitar-tab-editor": esPost9,
  "how-to-convert-audio-to-guitar-tabs": esPost10,
  "how-to-edit-guitar-tabs-for-practice": esPost11,
  "how-to-fix-ai-guitar-tabs": esPost12,
  "how-to-learn-guitar-faster-using-ai-tools": esPost13,
  "how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes": esPost14,
  "how-to-use-generate-cuts-cut-regions-and-optimize": esPost15,
  "how-to-write-guitar-tabs-online-without-downloading-software": esPost16,
  "manual-vs-ai-guitar-transcription-which-is-better-for-guitar-players": esPost17,
  "mp3-to-guitar-tabs": esPost18,
  "note-to-tab-converter-how-to-turn-guitar-notes-into-tablature-online": esPost19,
  "song-to-guitar-tabs": esPost20,
  "tab-editor-for-guitar": esPost21,
  "the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly": esPost22,
  "wav-to-guitar-tabs": esPost23,
  "why-guitar-tabs-can-be-wrong": esPost24,
  "youtube-to-guitar-tabs-workflow": esPost25,
};
export const japanesePosts = {
  "ai-guitar-tab-editor": jaPost0,
  "ai-guitar-tab-generator-convert-any-song-even-youtube-into-tabs": jaPost1,
  "ascii-guitar-tab-editor": jaPost2,
  "free-online-guitar-tab-maker": jaPost3,
  "guitar-fingering-optimizer": jaPost4,
  "guitar-pro-alternative-online": jaPost5,
  "guitar-solo-tab-maker": jaPost6,
  "guitar-tab-creator-with-playback": jaPost7,
  "guitar-tab-editor": jaPost8,
  "guitar-tab-maker-vs-guitar-tab-editor": jaPost9,
  "how-to-convert-audio-to-guitar-tabs": jaPost10,
  "how-to-edit-guitar-tabs-for-practice": jaPost11,
  "how-to-fix-ai-guitar-tabs": jaPost12,
  "how-to-learn-guitar-faster-using-ai-tools": jaPost13,
  "how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes": jaPost14,
  "how-to-use-generate-cuts-cut-regions-and-optimize": jaPost15,
  "how-to-write-guitar-tabs-online-without-downloading-software": jaPost16,
  "manual-vs-ai-guitar-transcription-which-is-better-for-guitar-players": jaPost17,
  "mp3-to-guitar-tabs": jaPost18,
  "note-to-tab-converter-how-to-turn-guitar-notes-into-tablature-online": jaPost19,
  "song-to-guitar-tabs": jaPost20,
  "tab-editor-for-guitar": jaPost21,
  "the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly": jaPost22,
  "wav-to-guitar-tabs": jaPost23,
  "why-guitar-tabs-can-be-wrong": jaPost24,
  "youtube-to-guitar-tabs-workflow": jaPost25,
};
type Translation = typeof post0;
export function articleTranslation(slug: string, updatedAt?: string, title?: string, locale: AppLocale = "pt-BR"): Translation | null {
 const row = ((locale === "ja" ? japanesePosts : locale === "es" ? spanishPosts : locale === "pt-BR" ? portuguesePosts : {}) as Record<string, Translation>)[slug];
 if (!row || (updatedAt && row.sourceUpdatedAt !== updatedAt) || (title && row.sourceTitle !== title)) return null;
 return row;
}

/** Only translate a source revision that has a matching translated draft. */
export async function localizeBlogProps<P extends Record<string, unknown>>(props: P, locale: AppLocale = "pt-BR"): Promise<P> {
 const visit = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(visit);
  if (!value || typeof value !== "object") return value;
  const item = value as Record<string, unknown>;
  const row = typeof item.slug === "string" && typeof item.title === "string" ? articleTranslation(item.slug, typeof item.updatedAt === "string" ? item.updatedAt : undefined, item.title, locale) : null;
  const result = Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
  if (row) Object.assign(result, {title: row.title, excerpt: row.excerpt, ...("readingMinutes" in item ? {readingMinutes: localizedReadingTime(row.content, locale).minutes} : {}), ...("seoTitle" in item ? {seoTitle: row.seoTitle, seoDescription: row.seoDescription} : {})});
  return result;
 };
 const result = visit(props) as P;
 const post = props.post as Record<string, unknown> | undefined;
 if (post && typeof post.slug === "string") {
  const row = articleTranslation(post.slug, String(post.updatedAt), String(post.title), locale);
  if (row) {
   const content = row.content.replace(/\]\((\/[^\s)]*)\)/g, (_, path: string) => `](${localeHref(path, locale)})`);
   const compiled = await compilePostContent(content, "PLAIN", {title: row.title});
   Object.assign(result, {post: {...result.post as object, contentHtml: compiled.contentHtml, canonicalUrl: null, contentLanguage: locale}, toc: compiled.contentToc, readingMinutes: localizedReadingTime(content, locale).minutes, wordCount: localizedReadingTime(content, locale).words});
  } else {
   // A changed or new article must never silently serve stale translated text.
   Object.assign(result, {post: {...post, contentLanguage: "en"}});
  }
 }
 return result;
}

import type { GetServerSideProps, GetStaticProps } from "next";
import { withPortuguesePilot, withPortugueseStaticPage, withSpanishPilot, withSpanishStaticPage, withJapanesePilot, withJapaneseStaticPage, withLocalizedPilot, withLocalizedStaticPage } from "../pilot";
export function withPortugueseBlogPage<P extends Record<string, unknown>>(loader: GetServerSideProps<P>): GetServerSideProps<P> {
 return withPortuguesePilot<P>(async ctx => {
  const result = await loader(ctx);
  return "props" in result ? {...result, props: await localizeBlogProps(await result.props)} : result;
 });
}
export function withPortugueseBlogStaticPage<P extends Record<string, unknown>>(loader: GetStaticProps<P>): GetServerSideProps<P> {
 return withPortugueseStaticPage<P>(async ctx => {
  const result = await loader(ctx);
  return "props" in result ? {...result, props: await localizeBlogProps(await result.props)} : result;
 });
}

export function withSpanishBlogPage<P extends Record<string, unknown>>(loader: GetServerSideProps<P>): GetServerSideProps<P> {
 return withSpanishPilot<P>(async ctx => {
  const result = await loader(ctx);
  return "props" in result ? {...result, props: await localizeBlogProps(await result.props, "es")} : result;
 });
}
export function withSpanishBlogStaticPage<P extends Record<string, unknown>>(loader: GetStaticProps<P>): GetServerSideProps<P> {
 return withSpanishStaticPage<P>(async ctx => {
  const result = await loader(ctx);
  return "props" in result ? {...result, props: await localizeBlogProps(await result.props, "es")} : result;
 });
}

export function withJapaneseBlogPage<P extends Record<string, unknown>>(loader: GetServerSideProps<P>): GetServerSideProps<P> {
 return withJapanesePilot<P>(async ctx => {
  const result = await loader(ctx);
  return "props" in result ? {...result, props: await localizeBlogProps(await result.props, "ja")} : result;
 });
}
export function withJapaneseBlogStaticPage<P extends Record<string, unknown>>(loader: GetStaticProps<P>): GetServerSideProps<P> {
 return withJapaneseStaticPage<P>(async ctx => {
  const result = await loader(ctx);
  return "props" in result ? {...result, props: await localizeBlogProps(await result.props, "ja")} : result;
 });
}

/** Japanese is not space-delimited. Use a character-based estimate for its reading time. */
export function localizedReadingTime(content: string, locale: AppLocale) {
 if (locale !== "ja") return estimateReadingTime(content);
 const text = content.replace(/```[\s\S]*?```/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/[\s#*_`>|-]/g, "");
 return {minutes: Math.max(1, Math.ceil(Array.from(text).length / 500)), words: Array.from(new Intl.Segmenter("ja", {granularity: "word"}).segment(text)).filter(part => part.isWordLike).length};
}

export function withLocalizedBlogPage<P extends Record<string, unknown>>(locale: AppLocale, loader: GetServerSideProps<P>): GetServerSideProps<P> {
 return withLocalizedPilot<P>(locale, async ctx => {
  const result = await loader(ctx);
  return "props" in result ? {...result, props: await localizeBlogProps(await result.props, locale)} : result;
 });
}
export function withLocalizedBlogStaticPage<P extends Record<string, unknown>>(locale: AppLocale, loader: GetStaticProps<P>): GetServerSideProps<P> {
 return withLocalizedStaticPage<P>(locale, async ctx => {
  const result = await loader(ctx);
  return "props" in result ? {...result, props: await localizeBlogProps(await result.props, locale)} : result;
 });
}
