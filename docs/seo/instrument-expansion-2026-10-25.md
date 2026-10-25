# Instrument search expansion

October 25, 2026. Branch: `codex/instrument-seo`. This prepares reviewable pages; it does not promise rankings, release pages, or request indexing before the URLs exist in production.

## Strategy and page ownership

Extend the October 21 guitar audit, preserving established URLs, content, redirects, canonicals and the homepage. One commercial page per instrument/task covers its synonyms. Do not multiply MP3/WAV/YouTube pages for every instrument. Editor and transcription are separate jobs; supporting guides teach the workflow rather than repeat the landing page.

| Audience | Transcription intent | Writing/editing intent | Supporting guide |
| --- | --- | --- | --- |
| Piano (first priority) | `/piano-transcription`: piano transcription, piano audio to sheet music/music notation, piano audio to MIDI | `/piano-sheet-music-editor`: piano music notation editor, sheet music editor, piano roll, notation software | Audio → notation; MIDI editing; writing notation; piano roll vs score; YouTube; transcription correction |
| Guitar | Preserve `/`, existing audio, MP3 and YouTube pages | Preserve `/editor`, free maker and feature pages | Preserve existing guitar guides |
| Bass | Improve existing `/audio-to-bass-tabs` | Preserve `/bass-tab-editor` | Transcribing a bassline; writing bass tabs; practice with tabs |
| Drums | `/drum-transcription`: drum audio to notation/MIDI | `/drum-notation-editor`: drum sheet music, beat/fill writing with playback | Transcribing a groove; reading drum notation; writing beats/fills |
| Ukulele | `/ukulele-transcription`: editable pitches and arrangement workflow | `/ukulele-tab-editor`: four-string tab maker, high-G/low-G | High-G/low-G tab writing; melody transcription; fingerstyle practice |

`/instruments` is a browsable directory linked from the footer. Piano transcription also gets a direct footer link. This builds discovery without displacing guitar in the working header or homepage. Existing bass pages gain editorial links in English only; translated bass editions never point to nonexistent localized guides.

## Evidence and uncertainty

The saved October 21 Search Console audit is the historical first-party baseline; no new query-volume numbers are invented. The controlled browser's current Search Console session requires Google sign-in, so current country/query/page figures were not available during this work. Do not substitute competitor page counts for measured demand.

Search-result reconnaissance shows piano tools using sheet-music/MIDI language and drum tools using notation/MIDI language. This is vocabulary evidence, not keyword volume or a conversion benchmark. Prioritise piano because of the requested product focus; no unsupported claim that instrument popularity guarantees visits or revenue is made.

References:
- [Google people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google doorway-abuse guidance](https://developers.google.com/search/docs/essentials/spam-policies#doorway-abuse)
- [Google localized editions guidance](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Piano workflow terminology](https://musirion.ai/)
- [Drum workflow terminology](https://drum2notes.klang.io/)

## Content, languages and indexing

Six new landing pages, fifteen substantive original English guides and one directory. Piano gets six guides; bass, drums and ukulele get three each. No keyword-only aliases, copied vendor text, invented testimonials, accuracy percentages or fabricated benchmark results. Original notation examples are labelled as examples and remain vector-sharp. Music glyphs are converted to paths so previews cannot lose noteheads when image fonts are unavailable.

New long-form content currently has **English editions only**. There are no fake localized pages or hreflang alternates. Navigation labels and the existing transcriber's instrument-specific entry context are translated in all ten UI languages. Translations of these new articles/landing pages require a separate content pass before adding localized routes, sitemap variants and reciprocal hreflang. This follows the current rule that only real translated editions should be indexed.

All new canonical URLs are added to the sitemap with a truthful content modification date. Existing localized sitemap generation is unchanged. New static articles use the established article layout, heading compilation, sanitisation, contents list and Article schema, with Note2Tabs correctly represented as an organisation. They appear in the English RSS feed and an English guide section on the blog index and are internally linked from the matching instrument pages. Existing database articles are untouched.

Query-based transcriber entry keeps `/transcribe` canonical and does not create indexable instrument/format aliases. Its heading reflects the incoming instrument so a piano player does not land under “Convert Any Song to Guitar Tabs.” The model, pricing, allowance, upload flow and instrument detection are unchanged. The query describes requested context, not confirmed audio content.

## Product-entry validation

The direct editor links create/select the intended piano, drums or ukulele track. Existing guest work is preserved. Piano uses notation metadata; ukulele uses four strings and correct re-entrant high G (A4/E4/C4/G4 top-to-bottom), with low G also available. Backend save/commit and reload were checked using a disposable account project, which was deleted afterward. No customer song was changed.

Browser testing found a stripped `activeLaneId` in the guest API response. Preserve the requested track selection after saving. Four-string guest note entry also assumed guitar pitches; use the shared tuning mapping and test high-G, low-G and bass creation/reload through the API handler. Ukulele MusicXML identifies four string tunings and the correct instrument name. The pre-existing guitar tutorial remains manually available but is not automatically imposed on new piano/drum entries.

## Release and measurement

Validated locally: production TypeScript/build, 111 focused SEO/editor/API and existing-localization tests, desktop/mobile browser checks, real-backend metadata persistence, sitemap uniqueness, English RSS inclusion and internal link checks. Results for all 22 URLs are in `instrument-seo-checks-2026-10-25.json`. Keep changes on the branch for review until a merge is authorised.

After release: verify HTTP 200, indexable robots, self-canonical and sitemap contents on production. Submit the sitemap and request indexing for piano commercial pages first, followed by the piano guides, other instrument commercial pages and guides. Search Console decides indexing; no promise that every URL will index or rank immediately.

Measure matched 28-day periods (and shorter diagnostic windows without calling them conclusive):
1. Search Console query/page/country impressions, clicks, CTR and position for each instrument's cluster.
2. Unique landing users → transcriber CTA → accepted transcription → successful result/editor → signup/subscriber. Use the existing CTA event's `landing_path`, `destination`, `surface`, `placement` and article slug. Transcriber CTA events additionally record allowlisted `requested_instrument` context; never treat it as detected instrumentation.
3. Editor visitors → actual editing/export/save, separately from transcription users. Instrument-editor query destinations distinguish entry intent.
4. Compare commercial and informational pages separately. Review cannibalisation only if query-to-page evidence shows it; do not redirect a useful page merely because a synonym appears on another page.
5. Check piano outcomes first, then decide which substantive follow-up guide or localized edition is supported by evidence. No automated volume-spam expansion.

## Extending the guitar lessons to notation and other instruments

The new scope targets **music notation** explicitly, rather than assuming that mentions of sheet music alone are sufficient. Both piano commercial pages use music notation in the title, H1 and descriptive copy, while retaining sheet-music vocabulary and their existing canonical paths. The audio page also covers keyboard recordings, MP3/WAV and YouTube within the same task. The editor page covers writing, piano roll and notation-software intent. No synonym-only `/piano-notation-editor` alias is created.

`instrument-keyword-ownership-2026-10-25.csv` records intended query families, their canonical owners and informational/commercial intent. These are targeting hypotheses and observed search-result terminology, **not measured keyword volumes**. The existing October 21 guitar query-to-page evidence remains the basis for protecting working guitar URLs. An informational guide and a commercial tool page should be evaluated separately, as in the original guitar work.

Lessons applied across the new audiences:
- Teach a concrete workflow with original musical examples; do not clone a keyword into a generic article template.
- Support discovery, writing, correction/import and practice tasks with the appropriate pages, rather than multiplying near-identical commercial URLs.
- Link each instrument's commercial pages to its own guides, and link guides back to the correct tool. The blog index groups guides by instrument; it no longer labels the English journal solely for guitarists.
- Declare guide CTA intent explicitly. A correction guide opens the editor even if its title contains “transcription”; the YouTube piano guide opens the correct input mode.
- Retain the existing guitar homepage, format URLs, localized content and rankings-oriented URL ownership. Do not try to equalise article counts mechanically.
- Keep new long-form English editions distinct from translated UI. Localized editions still require actual translations before publication or hreflang expansion.

Search reconnaissance also checked the current vocabulary on first-party piano/notation, drum, bass and ukulele tools. References include [Lipi's notation workflow](https://lipi.nathanielschool.com/), [Online Drum Notation](https://www.onlinedrumnotation.com/), [Guitar Scribble's bass editor](https://guitarscribble.com/bass-tab-maker) and [SimpleNotation's ukulele editor](https://simplenotation.com/ukulele-tab-editor). These inform vocabulary and intent only; their feature claims are not copied into Note2Tabs copy. [Google Search Essentials](https://developers.google.com/search/docs/essentials) supports using descriptive user vocabulary in titles, headings and crawlable links; [Google's helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) explicitly rejects a preferred word count or bulk expansion for its own sake.
