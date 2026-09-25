# Editor SEO experiment — 2026-09-25

## Purpose

Increase qualified organic traffic to the standalone Note2Tabs editor without weakening the established transcription landing pages.

The experiment gives `/editor` one clear search purpose: an online guitar tab editor for manually writing, importing, playing, and practising tabs. `/free-guitar-tab-maker` keeps ownership of broader “maker”, “writer”, and “creator” searches. Transcription pages retain audio, MP3, YouTube, and AI-generator intent.

## Baseline

Search Console comparison used finalized data for 2026-08-25 through 2026-09-21:

- `/editor`: 53 clicks, 1,789 impressions, 2.96% CTR, average position 29.3.
- Previous 28 days: 82 clicks, 2,701 impressions, 3.04% CTR, average position 23.4.
- Representative queries included `guitar tab maker`, `tab maker`, `guitar tab writer`, `online guitar tab maker`, `tab editor`, and `guitar tab editor`.
- The canonical `/online-guitar-tab-editor` alias had only 1 click and 21 impressions at position 58.7. It already permanently redirects to `/editor` and remains excluded from the sitemap.

PostHog, using Google-organic entry visits in the preceding 28 days and meaningful product activity within seven days:

- `/editor`: 50 visitors; 24 performed editor or transcription activity (48.0%).
- `/free-guitar-tab-maker`: 76 visitors; 41 performed meaningful activity (53.9%).

These are one-off diagnostic cohorts, not saved canonical PostHog metrics.

## Hypothesis

A title, heading, description, and supporting copy that describe the editor directly will:

1. Help Google distinguish `/editor` from `/free-guitar-tab-maker` and the transcription pages.
2. Improve relevance for `online guitar tab editor`, `guitar tab editor`, and closely related editing queries.
3. Increase qualified editor entrances without reducing downstream editor use.

## Changes

- Page title changed from `Free Online Guitar Tab Maker & Editor | Note2Tabs` to `Online Guitar Tab Editor – Write, Play & Practise Tabs | Note2Tabs`.
- H1 changed from a brand-led benefit statement to `Write, play, and practise guitar tabs online.`
- Meta description now names playback, practice loops, fretboard-aware fingerings, multiple tracks, browser use, and file import.
- Structured-data application name now consistently uses “Online Guitar Tab Editor”.
- Added accurate import/export details and links to the existing format documentation.
- Added FAQs for supported import and export formats.
- No editor functionality, pricing, navigation, URL, canonical, or visual layout changed.

## Measurement

Use Search Console page-filtered data for `/editor` and compare complete 28-day windows after Google recrawls the page.

Primary measures:

- Non-branded clicks and impressions for editor-intent queries.
- CTR for queries where average position is between 4 and 20.
- Average position for `online guitar tab editor`, `guitar tab editor`, `tab editor`, and `guitar tab writer`.

Guardrails:

- Organic entrances that produce `gte_editor_viewed`, `gte_editor_created`, `gte_editor_action`, `gte_editor_saved`, or `gte_editor_imported` within seven days.
- Search traffic and rankings for `/free-guitar-tab-maker` and transcription landing pages.
- No indexing of `/gte/*` workspaces or the redirected `/online-guitar-tab-editor` alias.

Do not judge the experiment from the first few days. Search Console data is delayed and Google must recrawl the page. Review after one complete 28-day post-crawl window; use a second 28-day window if query volume is still too small.

## Success and rollback

Keep the change if editor-intent clicks or impressions improve directionally without a material decline in meaningful editor activity or the maker/transcriber pages.

Rollback if the page loses editor-intent visibility for two complete 28-day windows, attracts materially less-qualified traffic, or causes `/editor` and `/free-guitar-tab-maker` to exchange rankings without increasing combined clicks.

Rollback is a normal Git revert of the experiment commit. The baseline and previous copy are recorded above so the page can be restored without reconstructing the experiment.
