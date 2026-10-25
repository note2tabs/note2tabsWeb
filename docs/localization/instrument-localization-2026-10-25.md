# Instrument localization — 25 October 2026

Branch: `codex/instrument-localization`. Not merged or released.

## First batch

Authored localized editions of the six new instrument landing pages and the instrument directory in Brazilian Portuguese, Spanish, Japanese, Korean, Polish, Arabic, Simplified Chinese, French and Italian (63 routes). English source pages remain intact. These are concise localized adaptations rather than sentence-for-sentence replacements; retain instrument terminology, input formats, editing views, tuning and export intent.

Each edition has localized metadata, heading, CTA labels, workflow, supporting content, image descriptions and schema text. Piano retains the immediate upload/YouTube form. Editor routes keep `track=piano`, `track=drums` and `track=ukulele`. Arabic inherits the site's RTL layout. Localized sitemap and hreflang point only to these actual translated landing routes.

The piano transcription form's new status and error messages are translated too. No runtime translation service or external API is used.

## Still outstanding

The 15 new long-form instrument guides remain English-only. Do not advertise translated guide editions, fabricate hreflang or replace their original articles with templated translations. Translate each complete article and its topic-specific examples, then register matching source revisions with the existing article-localization system. Restore localized instrument-guide cross-links once those articles exist.

Before release, review localized terminology and rendered layouts, including Arabic RTL and Japanese/Chinese/Korean line wrapping. Run the relevant localized routing, sitemap, editor intent and guitar-regression checks. Do not merge this first batch as though the full article translation task were complete.

## Linguistic and search-intent review — second pass

Reviewed all nine landing catalogs against the English feature descriptions. This is a model-led editorial review, not independent native-speaker certification, a measured keyword-volume study, or a guarantee of search ranking.

Corrections made:

- French: correct elision around ukulélé; distinguish practising (s’entraîner) from repeating.
- Italian: retain natural spartito, tablatura, cassa/rullante and playback terminology; distinguish transcribing recordings from writing notation.
- Spanish: use ukelele consistently, with partitura, tablatura, bombo/caja and neutral task labels suitable for the shared Spanish edition.
- Brazilian Portuguese: preserve Brazilian piano/partitura, bateria/bumbo/caixa/chimbal and ukulele wording; keep the successful existing guitar localization untouched.
- Japanese: pair natural 採譜/自動採譜 and 楽譜 with the recording task; use 楽譜作成・編集 for the editor and TAB譜 for ukulele. Keep pitch extraction distinct from choosing fret positions.
- Korean: keep 채보 and 악보 제작·편집 tied to the correct task; clarify the relationship of clefs, notation and piano-roll editing; make drum instructions specific to kit hits.
- Polish: retain fortepian while naturally including pianino in relevant piano copy and the editor search title; use zapis nutowy/nuty, perkusja and tabulatura appropriately.
- Arabic: include clear نوتة موسيقية and instrument-specific transcription/editor wording; clarify tablature and high-G/low-G tuning without changing RTL behavior.
- Simplified Chinese: use 钢琴谱, 扒谱, 架子鼓谱 and 尤克里里四线谱; remove the unnecessarily narrow implication that the ukulele editor is only for fingerpicking.

All locales also gain distinct task-specific search titles, image descriptions that actually describe the score, accurate recording/result labels, drum-specific workflows without pitched-note/chord instructions, separate writing-focused drum/ukulele body content, explanations of re-entrant tuning, and visible localized FAQs with matching structured data. No claim of automatic ukulele fret placement, free unlimited transcription, specific processing time or transcription accuracy is added.

SEO approach: distinct recording-to-score and blank-editor intent; one H1 and self-canonical per actual edition; reciprocal language alternates; keep all existing English/guitar URLs and copy; no keyword-only extra pages. FAQs are for readers and accurate structured data, not a promise of Google FAQ rich results.

References consulted:
- Google, descriptive titles and consistent page language: https://developers.google.com/search/docs/appearance/title-link
- Google, localized versions, reciprocal alternates and translated main content: https://developers.google.com/search/docs/specialty/international/localized-versions
- Yamaha Japanese score technology, including 採譜/楽譜 usage: https://www.yamaha.com/ja/tech-design/research/technologies/musical-score-ai/
- Yamaha China drum pages, including 鼓谱 usage: https://www.yamaha.com.cn/products/musical-instruments/drums/ead
- Yamaha Polish P-525 manual, pianino/fortepian usage: https://pl.yamaha.com/files/download/other_assets/0/2169970/P-525_owners_manual_Pl_D0.pdf

These sources corroborate selected terminology and SEO mechanics. They do not independently validate every translated sentence. The 15 English-only articles remain outside this landing-copy review and still require complete translations.

Review validation: 54 focused tests passed; production webpack build and TypeScript passed. All 63 localized URLs returned HTTP 200 on the local production build, with one H1, the correct canonical path and 11 language/fallback alternate links. All 54 localized instrument landing pages rendered two localized FAQs with matching schema. Japanese piano entry retains the file input and localized editor link at a 390px mobile viewport; Arabic drum editing retains RTL, the drum-specific entry link and no horizontal overflow at the same viewport. See `instrument-render-review-2026-10-25.json`. The final Spanish wording also identifies charles as hi-hat for cross-regional clarity.
