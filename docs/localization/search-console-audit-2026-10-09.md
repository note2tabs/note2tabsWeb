# Localized Search Console audit — 9 October 2026

Property: `sc-domain:note2tabs.com`, accessed with the signed-in Note2Tabs account. Evidence: `search-console-status-2026-10-09.json`, `live-search-signals-2026-10-09.json`, and the updated `seo-production-checks.json`.

## Indexing findings and actions

The page-indexing report was last updated on 4 October 2026, before the translated editions went live. It lists 55 indexed URL examples, all English. Of the 48 canonical English URLs now in the sitemap, 44 appear in that report. This is a dated report, not a fresh per-URL confirmation for all 192 pages.

Fresh URL inspections returned:

| URL path | Google status | Crawl request |
| --- | --- | --- |
| `/ja` | Unknown to Google; no previous crawl | Accepted |
| `/pt-br` | Unknown to Google; no previous crawl | Accepted |
| `/es` | Unknown to Google; no previous crawl | Accepted |
| `/blog/how-to-learn-guitar-faster-using-ai-tools` | Unknown to Google; no previous crawl | Accepted |
| `/blog/ai-guitar-tab-generator-convert-any-song-even-youtube-into-tabs` | Discovered, not yet indexed; no previous crawl | Accepted |
| `/contact` | Discovered, not yet indexed; no previous crawl | Accepted |
| `/privacy` | Unknown to Google; no previous crawl | Accepted |

Google confirmed all seven URLs were added to its priority crawl queue after live eligibility testing. This is acceptance of a request, not completed indexing.

The sitemap was last read on 6 October, when Google reported 48 discovered pages. The updated sitemap contains 192 URLs, including all 144 translated public URLs. It was resubmitted successfully on 9 October. Bulk sitemap discovery is the appropriate submission path for all URLs; individual requests are limited and repeating them does not accelerate crawling.

A fresh live-production audit passed for every one of the 192 sitemap pages: successful HTTP response, expected server-rendered language, self-canonical, reciprocal `en`/`pt-BR`/`es`/`ja`/`x-default` links, indexing allowed, and nonempty search title/description. All four RSS feeds parsed as valid XML. The updated code was also checked against a production build locally.

**Full indexing is pending Google.** No translated URL should be called indexed based only on a successful live-page test, valid sitemap, or an accepted request. Check the updated sitemap read date and the indexing report after Google processes the release, then inspect excluded canonical product/article URLs individually.

## Regional query evidence and improvements

Period: 7 July–6 October 2026. This is the English-site baseline before the translation launch; anonymous query omissions mean visible query rows do not explain every click.

| Country | Clicks | Impressions (displayed) | Average position | Visible query rows |
| --- | ---: | ---: | ---: | ---: |
| Brazil | 151 | 2.08k | 8.3 | 203 |
| Japan | 70 | 612 | 6.3 | 107 |
| Spain | 120 | 1.38k | 13.0 | 216 |
| Mexico | 95 | 1.4k | 21.2 | 176 |

Brazil's visible product queries were mostly English; `tablatura maker` had 0 clicks and 1 impression. Japan included `タブ譜` (1 click, 1 impression), `音源 tab譜 変換` (0 clicks, 1 impression), and `youtubeの音源` (0 clicks, 1 impression). Mexico included `convertir audio a tablatura online gratis` (3 clicks, 18 impressions), `transcribir audio a tablatura online gratis` (2 clicks, 5 impressions), and `audio a tablatura` (0 clicks, 7 impressions). Spain's visible query list was predominantly English and branded. These small native-language samples are directional wording evidence, not a complete keyword-demand study.

- Shortened 18 Portuguese and 20 Spanish blog search titles to emphasize each article's subject instead of long explanatory suffixes. Article headings, bodies, editor UI, and English metadata remain intact. Titles are now at most 70 characters in Portuguese and 69 in Spanish; this is a concision check, not a guaranteed display width.
- Japanese homepage/transcriber metadata now explicitly includes 音源, 自動作成/採譜, and both TAB譜 and タブ譜. The visible interface wording and control sizes are unchanged.
- Spanish audio-converter metadata now uses “convertir audio a tablaturas de guitarra online,” matching observed Mexican search language without promising unlimited free transcription.
- Country/currency and language remain separate. Spanish targets Spanish speakers across countries; Portuguese targets Brazilian Portuguese; Japanese uses language-wide Japanese. Existing regional billing remains authoritative.

This is international/language SEO for a browser-based product. No fictional local offices, local-business schema, or geographic service promises were added.

The Search Console overview also reports existing Core Web Vitals groups as “needs improvement.” That predates the language rollout; this metadata/indexing task does not establish that every broader performance or competitive ranking factor is optimal.

References:
- [Google: Request recrawling](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Google: Multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
