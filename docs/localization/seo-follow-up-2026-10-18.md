# Multilingual SEO follow-up — 18 October 2026

## Translation batch

Added French and Italian editions of three practical, high-intent guides:

- `/blog/how-to-convert-audio-to-guitar-tabs`
- `/blog/mp3-to-guitar-tabs`
- `/blog/youtube-to-guitar-tabs-workflow`

Each edition includes localized title, summary, search title/description, complete article body, FAQ, and links to the local transcriber/converter/editor. Copy uses “tablature” in French and “tablatura / diteggiature” in Italian. It describes source-quality limitations and does not promise error-free transcription. Portuguese and other existing translations are untouched.

Registered both locales in the article revision manifests and translation loader. Completed editions become eligible for self-canonicals, reciprocal article hreflang, localized feeds/listings and sitemap entries. Untranslated articles remain explicit English fallbacks; changed source revisions remain excluded until retranslated.

Read the current published English bodies and checked production's serialized source timestamps. PostgreSQL timestamp-without-time-zone values read through node-postgres on a Stockholm host produced a two-hour offset; translation revisions deliberately match the canonical serialized production article values, not that locally shifted representation. No database writes were made.

Verification: 213 focused tests, TypeScript, and production build passed. Rendered all six article URLs against the current content database using the production build: correct French/Italian body language, self-canonical, index/follow robots, and localized editor links. Dedicated tests cover reciprocal sitemap entries and stale-source exclusion. This is an initial priority batch; the remaining French/Italian articles still need translation. No independent native-speaker review is claimed.

## Live indexing actions

Read the signed-in Note2Tabs Search Console domain property. Only request a URL after inspection explicitly reports it unindexed; do not resubmit already-indexed URLs.

Confirmed already indexed:

- `/pt-br/features/guitar-tab-fingering-optimizer`
- `/ko/features/guitar-tab-editor-shortcuts`

Google accepted indexing requests (visible “Indexing requested / URL was added to a priority crawl queue”):

- `/it/audio-to-guitar-tab-converter`
- `/fr/youtube-to-guitar-tabs`
- `/it/youtube-to-guitar-tabs`

Additional outcomes are appended below as they complete. Accepted requests are not confirmation of indexing. The new article translations cannot be submitted as translated pages until released.

Reference: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl

## Additional indexing outcomes

- `/fr/mp3-to-guitar-tabs`: indexing request accepted.
- `/it/mp3-to-guitar-tabs`: indexing request accepted.
- `/fr/editor`: already indexed; no request sent.
- `/it/editor`: already indexed; no request sent.

## Live sitemap audit

All 438 current sitemap URLs passed HTTP 200, expected HTML language, self-canonical, nonempty title/description, and absence of noindex. Distribution: English and each of the seven previously translated editions 49 URLs; French and Italian 23 each. This checks technical indexability only. The completed translation batch adds six article URLs once deployed. Summary: `seo-live-checks-2026-10-18.json`.

- `/fr/free-guitar-tab-maker`: indexing request accepted.
- `/fr/ai-guitar-tab-generator`: already indexed; no request sent.
- `/it/ai-guitar-tab-generator`: already indexed; no request sent.

- `/it/free-guitar-tab-maker`: indexing request accepted.
- `/zh-hans/blog/guitar-pro-alternative-online`: already indexed; no request sent.
