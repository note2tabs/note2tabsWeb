# Site quality SEO rollout — 2026-10-04

## Purpose

Improve the quality and clarity of Note2Tabs' indexed surface without removing
any article or product page that already earns search traffic or meaningful
product engagement. This is also the baseline for evaluating the change after
deployment.

## Change set

- Keep every individual blog article indexed.
- Keep `/blog/cluster/audio-to-guitar-tabs` indexed because it already earns
  organic clicks.
- Add `noindex,follow` to tag archives, category archives, and cluster archives
  without demonstrated traffic. They remain usable navigation pages and their
  links remain crawlable.
- Permanently redirect confirmed obsolete YouTube, MP3, and one malformed blog
  URL to the closest canonical page.
- Do not change transcriber/editor landing-page copy, article copy, canonicals,
  sitemap membership, or site navigation in this rollout.

## Search Console baseline

Source: Google Search Console, `https://www.note2tabs.com/`, 2026-06-30 through
2026-09-29. Captured 2026-10-04 before deployment.

Site total: 7,043 clicks, 86,992 impressions, 8.1% CTR, average position 12.5.

| Page | Clicks | Impressions |
| --- | ---: | ---: |
| `/` | 5,578 | 56,936 |
| `/ai-guitar-tab-generator` | 389 | 8,690 |
| `/youtube-to-guitar-tabs` | 261 | 2,955 |
| `/editor` | 225 | 7,156 |
| `/mp3-to-guitar-tabs` | 207 | 2,504 |
| `/free-guitar-tab-maker` | 112 | 3,978 |
| `/features/guitar-tab-import-export` | 104 | 2,198 |
| `/blog/the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly` | 68 | 2,784 |
| `/audio-to-guitar-tab-converter` | 50 | 1,603 |
| `/transcribe` | 35 | 2,025 |
| `/blog/how-to-convert-audio-to-guitar-tabs-a-complete-guide-for-guitarists` | 16 | 1,987 |
| `/blog/cluster/audio-to-guitar-tabs` | 3 | 89 |
| `/blog/category/guitar-tabs` | 0 | 26 |
| `/blog` | 0 | 581 |

All observed tag archives had zero clicks and only 1–5 impressions. The
non-protected cluster archives also had zero clicks. These are the only indexed
surfaces changed by this rollout.

## PostHog baseline

Source: Note2TabsAnalytics, preceding 90 days, same-session entry and product
activity analysis captured 2026-10-04.

| Article entry | Sessions | Product activity | Transcription | Signup | Pricing |
| --- | ---: | ---: | ---: | ---: | ---: |
| Best AI guitar tab generator | 86 | 20 | 15 | 16 | 4 |
| Note-to-tab / fretboard positions | 65 | 7 | 3 | 4 | 4 |
| ASCII tab editor | 35 | 1 | 0 | 0 | 1 |
| Convert audio to guitar tabs | 23 | 3 | 2 | 2 | 0 |
| MP3 to guitar tabs | 13 | 5 | 1 | 1 | 5 |
| Guitar solo guide | 11 | 1 | 1 | 1 | 0 |
| WAV to guitar tabs | 10 | 4 | 3 | 3 | 1 |

Existing `$pageview`, signup, pricing, transcription, and editor events are the
measurement source. No new high-volume analytics event or database storage is
introduced.

## Measurement plan

Use the production deployment date as day 0 and compare equivalent windows,
not incomplete calendar days:

1. Day 7: confirm redirects resolve once, protected pages remain indexed, and
   no traffic-bearing article has an accidental `noindex` or canonical change.
2. Day 28: compare Search Console clicks, impressions, CTR, and position for
   blog articles, product pages, and changed archive URLs against the preceding
   28 days. Segment branded and non-branded queries where possible.
3. Day 28: compare Google-organic landing sessions and meaningful product
   activity in PostHog against the preceding 28 days.
4. Day 56: repeat the comparison because recrawling and reindexing can lag.

Guardrails: revert the relevant rule if a protected article/product page loses
indexability, a redirect points to an unrelated intent, or organic clicks to a
changed surface decline materially without being recovered by its canonical
destination. Do not interpret the first few days as an SEO result.
