import { readFileSync, existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SeoLandingPage from "../../components/SeoLandingPage";
import { instrumentSeoPages } from "../../lib/instrumentSeoPages";
import { instrumentGuideProps } from "../../lib/instrumentGuides";
import { instrumentGuides } from "../../lib/instrumentGuideIndex";
import { getBlogProductPaths, getBlogPrimaryAction } from "../../lib/blogProductPaths";
import { instruments } from "../../pages/instruments";

describe("instrument SEO and task matching", () => {
  it("gives each supported instrument separate transcription and writing destinations", () => {
    expect(instruments.map(item => item.name)).toEqual(["Piano","Guitar","Bass","Drums","Ukulele"]);
    for (const instrument of instruments) {
      expect(instrument.transcribe).not.toBe(instrument.editor);
      for (const href of [instrument.transcribe,instrument.editor]) expect(existsSync(`pages${href}.tsx`) || existsSync(`pages${href}/index.tsx`)).toBe(true);
    }
  });
  it.each(Object.entries(instrumentSeoPages))("renders %s with its own task, useful content and instrument-specific illustration", (slug,page) => {
    const html = renderToStaticMarkup(createElement(SeoLandingPage,page));
    expect(html).toContain(page.title);
    expect(html).toContain(`href="${page.primaryCta.href.replaceAll("&","&amp;")}"`);
    expect(html).toContain(page.preview!.alt.replaceAll('&','&amp;'));
    expect(page.hasTranslation).toBe(false); // No English text advertised as a translated edition.
    expect(page.metaTitle.length).toBeLessThan(86);
    expect(page.description.length).toBeLessThan(200);
    expect(page.contentSections!.length).toBeGreaterThanOrEqual(3);
    expect(page.faqs!.length).toBeGreaterThanOrEqual(4);
    expect(existsSync('public'+page.preview!.src)).toBe(true);
    expect(html).not.toContain('Guitar recording');
    if(slug.startsWith('piano')) expect(html).not.toContain('Audio → editable tabs');
    if(slug.endsWith('editor')) expect(page.primaryCta.href).toMatch(/^\/gte\/new\?track=(piano|drums|ukulele)$/);
    else expect(page.primaryCta.href).toMatch(/^\/transcribe\?instrument=(piano|drums|ukulele)$/);
  });
  it.each(instrumentGuides)("compiles $slug into a full article with valid headings and useful internal links",async guide => {
    const result=await instrumentGuideProps(guide.slug);
    if(!result.props)throw Error('Missing guide');
    expect(result.props.wordCount).toBeGreaterThan(450);
    expect(result.props.toc.length).toBeGreaterThanOrEqual(5);
    expect(result.props.post.contentHtml).not.toContain('<script');
    expect(result.props.post.contentHtml).not.toContain('<h1');
    expect(result.props.post.contentLanguage).toBe('en');
    const paths=getBlogProductPaths(guide.slug,guide.title);
    expect(paths[0].label.toLowerCase()).toContain(guide.instrument==='drums'?'drum':guide.instrument);
    expect(paths.every(item=>!item.href.includes('guitar'))).toBe(true);
    const action=getBlogPrimaryAction(guide.slug,guide.title);
    expect(action.href).toBe(guide.goal === 'transcribe'?`/transcribe?instrument=${guide.instrument}${guide.mode === 'youtube' ? '&mode=youtube' : ''}`:`/gte/new?track=${guide.instrument}`);
    const links=[...result.props.post.contentHtml.matchAll(/href="(\/[^"#?]*)/g)].map(item=>item[1]);
    for(const href of links)expect(existsSync(`pages${href}.tsx`)||existsSync(`pages${href}/index.tsx`)||href==='/gte/new').toBe(true);
  });
  it("preserves established guitar topic ownership", () => {
    expect(getBlogProductPaths('mp3-to-guitar-tabs','MP3 to guitar tabs')[0].href).toBe('/mp3-to-guitar-tabs');
    expect(getBlogPrimaryAction('how-to-write-guitar-tabs','Write guitar tabs').href).toBe('/gte/new');
    const sitemap=readFileSync('pages/sitemap.xml.ts','utf8');
    expect(sitemap).toContain('instrumentSeoPages');
    expect(sitemap).toContain('instrumentGuides');
    expect(sitemap).toContain('for (const path of instrumentPaths)');
    // These paths are outside staticPaths, whose members generate language alternates.
    expect(sitemap.slice(sitemap.indexOf('const staticPaths'),sitemap.indexOf('const recentlyUpdatedSeoPaths'))).not.toContain('instrumentSeoPages');
  });
});

import { transcriptionEntryInstrument, transcriptionEntryHref, TRANSCRIPTION_ENTRY_TITLES } from "../../lib/instrumentTranscriptionEntry";
it("keeps instrument entry context allowlisted and separate from audio detection", () => {
  for(const instrument of ["piano","bass","drums","ukulele"] as const) {
    expect(transcriptionEntryInstrument(instrument)).toBe(instrument);
    expect(TRANSCRIPTION_ENTRY_TITLES[instrument]).toMatch(/^Transcribe/);
    expect(transcriptionEntryHref(instrument)).toBe(`/transcribe?instrument=${instrument}`);
  }
  for(const value of ["__proto__","constructor",["piano"],"<script>",null])expect(transcriptionEntryInstrument(value)).toBeUndefined();
});

import { instrumentGuidesForPath } from "../../lib/instrumentGuideIndex";
it("covers music notation and sheet music on the same piano task URLs", () => {
  for (const slug of ['piano-transcription','piano-sheet-music-editor']) {
    const page=instrumentSeoPages[slug];
    expect(page.metaTitle.toLowerCase()).toContain('music notation');
    expect(page.metaTitle.toLowerCase()).toContain('sheet music');
    expect(page.title.toLowerCase()).toContain('music notation');
    const html=renderToStaticMarkup(createElement(SeoLandingPage,page));
    const guides=instrumentGuidesForPath(page.canonicalPath)!;
    expect(guides.guides).toHaveLength(6);
    for(const guide of guides.guides)expect(html).toContain(`href="/blog/${guide.slug}"`);
  }
  expect(instrumentSeoPages['piano-notation-editor']).toBeUndefined();
});
it("links each other instrument to its own writing, practice and transcription guides", () => {
  for(const path of ['/bass-tab-editor','/audio-to-bass-tabs','/drum-transcription','/drum-notation-editor','/ukulele-tab-editor','/ukulele-transcription']) {
    const group=instrumentGuidesForPath(path)!;
    expect(group.guides).toHaveLength(3);
    expect(group.guides.some(g=>g.goal==='transcribe')).toBe(true);
    expect(group.guides.some(g=>g.goal==='editor')).toBe(true);
  }
});
it("routes correction articles to editing and YouTube articles to the correct input mode", () => {
  expect(getBlogPrimaryAction('how-to-fix-a-piano-transcription','How to Fix a Piano Transcription').href).toBe('/gte/new?track=piano');
  expect(getBlogPrimaryAction('how-to-transcribe-piano-from-youtube','How to Transcribe Piano from YouTube').href).toBe('/transcribe?instrument=piano&mode=youtube');
  expect(getBlogProductPaths('piano-roll-vs-sheet-music-notation','Piano Roll vs Sheet Music')[1].label).toBe('Piano music notation editor');
});
