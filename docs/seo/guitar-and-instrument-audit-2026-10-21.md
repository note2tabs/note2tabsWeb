# Guitar search growth and instrument readiness

Reviewed October 21, 2026. Work remains on branches; no release or indexing changes are authorized by this audit.

## Search evidence

Read the connected domain property's Web performance report for September 22–October 19, 2026 (28 days). The report showed 3.27k clicks, 40.8k impressions and an average position of 7.6. Saved a shortlist of reported queries with at least 40 impressions and positions 4–20 in `guitar-query-opportunities-2026-10-21.csv`.

These are observed queries, not keyword-tool search volumes. The UI exposed 999 query rows; anonymized and omitted queries mean this is not all demand. Sitewide average position combines different URLs and appearances; it should not be treated as the position of the homepage alone. CTR is descriptive, not an estimate of conversion or guaranteed uplift.

| Query | Clicks | Impressions | Position |
| --- | ---: | ---: | ---: |
| guitar tab generator | 28 | 554 | 12.2 |
| tab generator | 17 | 477 | 8.0 |
| ai guitar tab generator | 9 | 351 | 9.3 |
| ai tab generator | 5 | 290 | 10.2 |
| audio to tabs | 26 | 257 | 6.2 |
| ai guitar tab generator free | 21 | 252 | 7.1 |
| audio to guitar tabs | 21 | 236 | 7.3 |
| tab maker | 4 | 223 | 12.6 |
| mp3 to guitar tab | 12 | 142 | 11.1 |

### Query-to-page checks

For exact query **guitar tab generator**, the homepage received 28 clicks / 485 impressions at position 6.7. The existing AI landing page had 0 / 27 at 41.4; the comparison blog had 0 / 18 at 36.3. All 28 clicks went to the homepage. This does not establish harmful cannibalization or justify redirecting the other pages. Keep the homepage as the broad product entry; do not add another generic generator page.

For exact query **tab maker**, `/free-guitar-tab-maker` led with 2 clicks / 137 impressions at 10.3, compared with the homepage's 1 / 69 at 16.7. The editor marketing page had 0 / 19 at 36.7. Strengthen the existing free tab-maker page for manual writing. Its opening reference section now explains starting a blank tab, entering notes and saving work; the audio alternative remains below it. Existing paragraphs, URLs, titles, descriptions, canonicals, hreflang and schemas are preserved.

Four reported bass query variants each had one impression and zero clicks; no ukulele query appeared in the exposed rows. This describes our current visibility, not the size or value of either market.

## Priority and ownership

1. **Broad guitar generation:** homepage. Preserve the working transcriber entry and useful explanatory content. Evaluate original audio/result demonstrations only after checking real model output and reuse rights; the current editor illustration is a manually entered local phrase and must not be presented as an accuracy benchmark.
2. **Manual tab creation:** existing `/free-guitar-tab-maker`, with direct blank-editor entry and the manual-first explanation implemented here. Keep the audio alternative subordinate.
3. **MP3 and audio input:** existing MP3/audio pages. Preserve format-specific preparation and limit guidance. Do not introduce WAV/FLAC/song-to-tab keyword variants without a separate useful workflow.
4. **YouTube:** existing YouTube page and link-mode entry. Preserve corrected duration advice and timestamp guidance.
5. **Editing, import and practice:** existing feature pages and supporting guides. Extend them with verified examples rather than creating synonyms of tab-maker pages.
6. **Bass:** fix and verify transfers before a dedicated landing page. If readiness is demonstrated, one bass editor page can cover tab maker, creator and editor intent together. Audio transcription needs its own validation before being advertised.
7. **Ukulele:** no instrument page until tuning, fingering, playback and transfers are verified. Four-string bass support does not establish ukulele support.

## Bass functionality audit

Code already contains four-string bass tracks, standard E–A–D–G and Drop D presets, pitch-preserving fingering calculations and bass playback instruments. Existing import tests cover bass MIDI program identification. This audit does not establish real-world audio transcription accuracy, five-string bass support or browser playback sound quality.

Reproduction used a new four-note standard-bass fixture at MIDI pitches 28, 33, 38 and 43, not customer data.

| Area | Finding |
| --- | --- |
| Standard tuning and pitch mapping | Existing tests pass for four strings and concert pitch without guitar octave substitution. |
| Text/native JSON export | Four string labels and native tuning/type preserved in the new audit checks. |
| MIDI transfer | Reproduced bass export re-importing as a guitar track because no instrument program was emitted. Fixed by writing General MIDI Electric Bass (finger), zero-based program 33, for bass only. Round-trip now preserves bass identity and all four pitches. |
| MusicXML export | Reproduced hard-coded Guitar part name and missing four-line staff metadata. Fixed bass part name, four staff lines and bottom-to-top open-string tuning metadata. Existing guitar output path is preserved. |
| MusicXML import | Still does not propagate a bass track type. Pitch-only notes use guitar mapping. Do not claim complete bass MusicXML round-trip support. |
| Plain-text bass import | Validator still requires a six-string guitar-style input. Do not claim bass text round-trip support. |
| Drop D MIDI re-import | Import mapping assumes standard bass range; low D needs separate handling. No claim of alternate-tuning MIDI round-trip support. |
| Audio transcription | No verified user-facing bass selection or end-to-end bass benchmark in this audit. No bass transcription SEO claims added. |
| Ukulele | No dedicated track/preset verified; high-G/low-G handling, chord/fret mapping and interoperability require separate work. |

The two export regressions failed before the fix. The focused suite passed afterward: bass transfer audit, tuning, import/export, search intent/localization and page-content checks (92 tests). TypeScript and the webpack production build also passed.

## SEO safeguards

- Added no public URLs, redirects, canonical changes, noindex changes, sitemap entries or language variants.
- Kept useful original landing-page content and existing search metadata. Reordering manual guidance does not remove it.
- Kept bass/ukulele out of public claims while product gaps remain.
- Keep this work unmerged for review. After any eventual release, compare query/page impressions, clicks, position and product activation over matched periods; do not interpret a few days of fluctuation as causality.

References: [Search Console report](https://search.google.com/u/2/search-console/performance/search-analytics?resource_id=sc-domain%3Anote2tabs.com&breakdown=query&num_of_days=28), [Google helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [MusicXML staff details](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/staff-details/), [MusicXML tablature example](https://www.w3.org/2021/06/musicxml40/musicxml-reference/examples/tutorial-tablature/).
