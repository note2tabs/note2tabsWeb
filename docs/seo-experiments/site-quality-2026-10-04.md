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

## Requirements for re-indexing archive pages

`noindex` is not a permanent judgement on these pages. It prevents thin,
largely duplicated archives from competing with articles and product pages
while they are still only navigation lists. Re-indexing should be deliberate:
do not remove `noindex` from every tag or category just because posts exist.

A tag, category, or cluster can become indexable when all of the following are
true:

1. **It serves a distinct search intent.** Search Console query data, keyword
   research, or repeated on-site behaviour must show a real question or task
   that is not already answered better by an existing article or product page.
   If the intent overlaps another page, improve that canonical page instead.
2. **It becomes a curated topic hub, not an automatic archive.** Add an
   original introduction that explains the topic, helps a reader choose where
   to start, and describes how the linked guides relate to one another. Do not
   add generic filler merely to reach a word count.
3. **It has enough strong material.** As a working minimum, the hub should have
   one clearly identified pillar guide and at least three useful supporting
   guides. Every included article must be current, relevant to the hub, and
   materially different from the others.
4. **The page offers value beyond its links.** Depending on the topic, include
   a concise comparison, learning path, decision guide, workflow, or other
   editorial element that would still help someone who did not click every
   article.
5. **Its search presentation is unique.** Give it a specific title, meta
   description, H1, and introductory copy. Add `CollectionPage` and `ItemList`
   structured data only when the visible page genuinely represents that
   collection; retain the breadcrumb markup.
6. **Its internal linking is intentional.** Link to the hub from the relevant
   pillar and supporting articles, and link back to those pages from the hub.
   Avoid sitewide links to weak archives and avoid creating near-identical hubs
   for synonymous tags.
7. **It passes technical review.** The page must return `200`, self-canonicalize,
   contain no conflicting robots directive, work on mobile, and have no empty
   or duplicated sections. Once approved for indexing, include it in the XML
   sitemap and add its slug to `INDEXABLE_BLOG_CLUSTERS` or the equivalent
   reviewed allowlist for its archive type.

### Evidence and review process

Before re-indexing, record in this file (or a new dated experiment document):

- the URL and archive type;
- the distinct query intent and supporting evidence;
- the pillar and supporting articles;
- the content and internal-linking improvements made;
- the date `noindex` is removed; and
- its pre-launch PostHog engagement baseline, if it already receives referral
  or internal traffic.

After re-indexing, inspect Search Console at 7, 28, and 56 days. Keep the page
indexed when it earns relevant impressions/clicks or demonstrably helps users
reach meaningful product activity. Rework or return it to `noindex,follow` if,
after adequate crawling time, it attracts irrelevant queries, cannibalizes a
stronger canonical page, or remains a thin search result with no user value.

### Current exception

`/blog/cluster/audio-to-guitar-tabs` remains indexable because it already had
organic clicks at baseline. It should still be improved against the same hub
quality checklist rather than treated as automatically complete.

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
