# Instrument SEO follow-up — October 31, 2026

## Evidence and priorities

Search Console's latest complete seven-day report (October23–29) shows79 clicks and about1,060 impressions on pages matching piano|bass|drum|ukulele|instruments, about7% of roughly1,150 site clicks. Bass editor29clicks; drum editor12; English bass transcription9; ukulele editor6. English piano transcription3 and piano editor2. Search-result visibility is established for these URLs, not every language edition. The piano launch is only six days old, so these are diagnostic observations rather than a ranking verdict.

PostHogOctober25–30:136 unique instrument-related page visitors,28 subsequent signups,18 transcription starters and zero checkout starters within24hours (separate ordered unique-person funnels). Only27 of698 tracked signups first landed on an instrument page. The current traffic growth is still predominantly from existing homepage/YouTube paths. Source report: `/tmp/n2t-instrument-seo-conversion-2026-10-31.md`; these figures are a dated observation, not a benchmark claim on product pages.

## Changes

- Four core transcription guides now have authored localized editions in all nine non-English site languages: piano audio-to-sheet-music, recorded bassline, drum recording and ukulele melody. These are substantial localized adaptations with six practical sections each, musical checks and direct instrument-aware tool links. They retain the same topic and canonical slug as the English guide. They do not replace or truncate the original English guides.
- Eleven other instrument guides remain English-only. No translated editions, sitemap entries or language alternates are invented for them. Finish these in a subsequent editorial pass, prioritizing piano writing/MIDI/YouTube based on query evidence.
- Static guide loading now works through the dynamic article route used by localized blog wrappers. Previously that loader only checked database posts, although the instrument guides live in files.
- Translated guide discovery is connected through each matching instrument landing page, the instrument directory and the blog index. Only actual authored translations are linked. Each guide links back to its instrument's transcriber/editor.
- Sitemap and RSS include real translated guides. Canonicals and reciprocal hreflang use the existing availability/release policy. Translation modification dates are distinct from the unchanged English-source revision. Duplicate database/static sitemap locations are avoided.
- Piano's English heading/title explicitly target audio-to-sheet-music as well as music notation. Ukulele metadata names tablature alongside notes without promising perfect automatic arrangements. Existing URLs own their synonyms; no format-by-instrument doorway pages are created.
- Navigation imports a small title/excerpt index. Full translated bodies remain on the server, outside browser bundles. Regenerate metadata using `node scripts/build-instrument-guide-metadata.cjs`; verify with `--check`.

No homepage, guitar landing copy, guitar URL ownership, redirects, pricing, models or credit allowances were changed. Existing guitar guides and feed entries remain available. No new conversion experiment or billing change is included.

## Editorial review and terminology

Reviewed for topic consistency, actionable musical examples, correct four-string bass register E1–A1–D2–G2, ukulele high-G G4 versus low-G G3, simultaneous drum events, piano hand/staff distinction, playback-speed versus written-tempo distinction, and MIDI versus MusicXML purpose. Japanese uses 採譜/楽譜, Korean 채보/악보, Simplified Chinese 音频转乐谱/扒谱, Polish transcription-to-nuty vocabulary and Brazilian Portuguese partitura/tablatura vocabulary. Existing Portuguese guitar content is untouched.

This is model-led editorial review, not independent native-speaker certification or measured regional keyword-volume research. No paid ranking tool, model transcription or email was triggered.

## Research

- Google link guidance: https://developers.google.com/search/docs/crawling-indexing/links-crawlable — crawlable contextual links with descriptive text.
- Google localized editions: https://developers.google.com/search/docs/specialty/international/localized-versions — reciprocal language annotations for actual editions.
- Helpful content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content — useful task coverage rather than preferred word counts or bulk keyword pages.
- First-party vocabulary reconnaissance: https://muscriptor.kyutai.org/ and https://musirion.ai/ confirm audio-to-sheet-music/MIDI/notation task vocabulary. No competitor prose, ranking claim or feature claim was copied.

## Release and measurement

Keep on the branch until merge authorization. After release verify the36 translated article URLs and their landing links on production, refresh the sitemap, and request indexing for piano first followed by bass/drums/ukulele. Google controls indexing and rankings; submissions cannot guarantee either. Do not request indexing for unpublished branch URLs.

Compare matched28-day periods separately for instrument commercial pages and guides, across query/page/country. Track transcriber starts, useful editor/playback/export outcomes and Stripe-confirmed new subscribers. Preserve the established guitar cohort as a separate control for sitewide changes; do not use the previously contaminated historical PostHog subscription chart as the sales baseline.

## Validation

- 273 tests passed across nine suites: instrument SEO/localization, direct piano entry, blog product routing/conversion, sitemap policy and all established blog translations, plus the new guide integration suite.
- Production webpack build and TypeScript passed. A production-mode local server returned HTTP200 for all36 translated guides with the correct H1, article language, self-canonical and11 language/default links. The localized route deployment traces include the source Markdown and translations, so Vercel can load them outside the development checkout.
- Browser review: Japanese desktop and Arabic mobile390px, correct language/direction, instrument destinations and no horizontal overflow. Review caught generic Arabic speech-transcription CTA wording; instrument guides now use music-specific labels and localized contextual tool descriptions.
- Original English guide bodies and protected guitar/homepage/redirect source files remain unchanged. A browser-bundle search found no full localized guide body text; navigation carries only metadata.

These checks establish content/routing/rendering correctness, not ranking uplift, independent native fluency certification or general transcription accuracy. No merge, production deploy or indexing submission was performed in this pass.
