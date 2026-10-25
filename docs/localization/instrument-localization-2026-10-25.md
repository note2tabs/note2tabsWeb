# Instrument localization — 25 October 2026

Branch: `codex/instrument-localization`. Not merged or released.

## First batch

Authored localized editions of the six new instrument landing pages and the instrument directory in Brazilian Portuguese, Spanish, Japanese, Korean, Polish, Arabic, Simplified Chinese, French and Italian (63 routes). English source pages remain intact. These are concise localized adaptations rather than sentence-for-sentence replacements; retain instrument terminology, input formats, editing views, tuning and export intent.

Each edition has localized metadata, heading, CTA labels, workflow, supporting content, image descriptions and schema text. Piano retains the immediate upload/YouTube form. Editor routes keep `track=piano`, `track=drums` and `track=ukulele`. Arabic inherits the site's RTL layout. Localized sitemap and hreflang point only to these actual translated landing routes.

The piano transcription form's new status and error messages are translated too. No runtime translation service or external API is used.

## Still outstanding

The 15 new long-form instrument guides remain English-only. Do not advertise translated guide editions, fabricate hreflang or replace their original articles with templated translations. Translate each complete article and its topic-specific examples, then register matching source revisions with the existing article-localization system. Restore localized instrument-guide cross-links once those articles exist.

Before release, review localized terminology and rendered layouts, including Arabic RTL and Japanese/Chinese/Korean line wrapping. Run the relevant localized routing, sitemap, editor intent and guitar-regression checks. Do not merge this first batch as though the full article translation task were complete.
