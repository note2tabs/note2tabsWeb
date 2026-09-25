# Transcriber SEO experiment — 2026-09-25

## Scope

This experiment changes only the homepage search snippet and its links to existing transcription landing pages. It does not include the separate editor SEO experiment, change transcription behavior, or alter pricing and model access.

## Evidence and baseline

Search Console comparison for the latest complete 28-day period (2026-08-25 through 2026-09-21) against the preceding 28 days:

- Site: 2,835 clicks from 37,988 impressions, 7.46% CTR, versus 2,377 clicks from 33,825 impressions and 7.03% CTR.
- Homepage: 2,115 clicks from 21,208 impressions, 9.97% CTR, average position 6.9.
- `mp3 to guitar tabs`: 5 clicks from 210 impressions, 2.38% CTR, position 8.1, versus 18/224, 8.04% CTR, position 8.0.
- `song to tabs`: 1 click from 96 impressions, 1.04% CTR, position 5.1, versus 6/87, 6.90% CTR, position 6.2.
- `audio to guitar tabs`: 18 clicks from 237 impressions, 7.59% CTR, position 8.3, versus 24/261, 9.20% CTR, position 6.8.
- `youtube to guitar tabs`: 26 clicks from 80 impressions, 32.50% CTR, position 4.5, versus 36/84, 42.86% CTR, position 2.5.

The homepage currently receives most impressions for these broad commercial queries. The dedicated MP3 page receives only 26 impressions for `mp3 to guitar tabs`, while the homepage receives 199. Google-organic homepage visitors also reached meaningful product activity within seven days at 52.9% (1,967 visitors in the PostHog sample), so this experiment is intended to improve qualified acquisition rather than trade traffic for low-intent visits.

## Hypothesis

A specific title and description that state AI guitar-tab generation, accepted sources, and the usable result will improve qualified CTR, especially on desktop. A direct homepage link to the MP3 landing page should also make the page relationship clearer without weakening the homepage's role as the primary transcriber entry point.

## Changes

- Homepage title: `AI Guitar Tab Generator – Audio & YouTube to Tabs | Note2Tabs`.
- Homepage description explicitly names MP3, WAV, YouTube, editable tabs, practice, and export.
- The existing workflow section now links directly to the MP3 converter in addition to the general audio, YouTube, and AI workflow pages.
- The four paths use a four-column desktop, two-column tablet, and one-column mobile layout.

## Measurement

Compare complete 28-day periods after Google has recrawled the homepage. Review these separately from the editor experiment:

Primary:

- Homepage clicks, impressions, CTR, and average position.
- Query metrics for `mp3 to guitar tabs`, `song to tabs`, `audio to guitar tabs`, `youtube to guitar tabs`, `guitar tab generator`, and `ai guitar tab generator`.
- Desktop CTR for the same query group.

Guardrails:

- Clicks and impressions for `/mp3-to-guitar-tabs`, `/audio-to-guitar-tab-converter`, `/youtube-to-guitar-tabs`, and `/ai-guitar-tab-generator`.
- Google-organic meaningful product activity within seven days for the homepage and each converter page.
- Paid conversion from Google-organic visitors.

Do not judge the experiment from a few days of volatility. Retain it if clicks and qualified activity improve without a sustained loss in the dedicated converter pages. Treat rankings and snippets as Google-controlled outcomes rather than guaranteed results.

## Rollback

Revert the commit that introduced this document. That restores the previous homepage metadata, three-card workflow section, and grid styling without touching the separate editor experiment.
