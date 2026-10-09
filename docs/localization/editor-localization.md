# Editor localization

Branch: `codex/editor-localization`, based on `codex/additional-locales` at `92d25b7f` (PR #187). This branch contains the editor changes separately from the four new site languages. It has not been merged or deployed.

## Behavior and coverage

`/gte`, `/gte/[editor_id]`, the ASCII export page and text-import flow now use English, Brazilian Portuguese, Spanish, Japanese, Korean, Polish, Arabic or Simplified Chinese. Language preference is read on the server from the saved choice or device language. Explicit English wins over device language; Traditional Chinese does not automatically select Simplified Chinese; disabled releases fall back to English.

Project URLs, IDs, stored names, notes, chords, file formats, shortcuts and musical axes remain shared across languages. Switching language loads the selected dictionary and updates the existing editor without navigating or resetting its project. Existing generated names are localized for display; custom names and exported project data are preserved. Authentication return URLs retain the project and selected site language.

Each language has 986 editor entries covering the library, workspace modes, menus, controls, help, five tutorial cards, accessible labels, status/error messages, sharing controls, import/export, practice, drum patterns, tuning and sampled instruments. Unknown backend errors receive the existing native generic fallback. Illustrative tutorial recordings retain their original English screen capture; their captions, instructions and alternative text are translated.

The selected editor dictionary is included in server props for matching initial rendering, then loaded on demand when the user switches languages. Other editor dictionaries are separate chunks. English template keys support presentation-time translation of generated messages such as saved times and validation limits; identifiers and stored names are not localized by that matcher.

Arabic uses a right-to-left document and native text, while the editor's timeline, fretboard, musical symbols, code, ASCII input and numerical controls keep their established direction. Tutorial shortcut labels retain their physical key names, and tutorial navigation arrows follow the interface language. The language menu stays visible while open and is excluded from the editor's global keyboard shortcuts.

Editor routes remain `noindex, follow` with `private, no-store` caching and `Vary: Accept-Language, Cookie`. They do not gain public localized SEO URLs. Existing translated marketing pages and public SEO routes are unchanged. Analytics identify the editor's actual chosen language despite the shared `/gte` URL; country remains an independent cohort field.

## Terminology review

Words were checked against their actual controls, not only a dictionary. In particular:

- **Scale** changes start times and/or durations, while **Key scale** is a musical scale. **Time scale** controls the timeline view. These meanings are distinguished in the copy.
- **Bar** is a musical measure; **Key** is musical tonality; **Fingering** refers to guitar fingering/positions; **Solo** isolates a track rather than describing a musical solo.
- **Playing coordinates** are regions of hand/fretboard position. **Cut** splits those regions; **Slice** splits notes. The source's internal `Phyrigian` identifier is retained, but the displayed mode uses the correct Phrygian term.
- Brazilian Portuguese uses **digitação**, distinct from fingerpicking. The instrument preset **Strings** is a **string ensemble**, distinct from guitar strings.
- Pitch letters, chord symbols, format/brand names and physical shortcut keys are retained where appropriate.

| Meaning | PT-BR | Spanish | Japanese | Korean | Polish | Arabic | Simplified Chinese |
|---|---|---|---|---|---|---|---|
| Fingering | Digitação | Digitación | 運指 | 운지 | Palcowanie | وضع الأصابع | 指法 |
| Musical key | Tonalidade | Tonalidad | 調 | 조성 | Tonacja | المقام | 调性 |
| Musical scale | Escala musical | Escala musical | 音階 | 음계 | Skala muzyczna | سلّم المقام | 音阶 |
| Fret | Casa | Traste | フレット | 프렛 | Próg | الفريت | 品位 |
| Position regions | Posições no braço | Posiciones de ejecución | 演奏ポジション | 연주 위치 | Pozycje gry | مناطق موضع اليد | 演奏位置 |

The seven blog guides that explicitly described the editor's controls as English-only have that obsolete statement removed. Source revision/title guards and links are retained.

## Validation

- 939 tests in 171 files pass. Editor-specific checks cover every catalogue key/placeholder/tutorial token, server-selected rendering, preferences/device language, disabled releases, unchanged IDs/return URLs, dynamic status/validation translation, custom names, grammatical counts and instrument terminology. Existing editor, playback, import/export, guest-persistence, privacy and locale tests remain passing.
- TypeScript, production Next.js Webpack build and diff whitespace checks pass.
- 123 browser measurements cover all eight languages: core editor at mobile/tablet/desktop widths, expanded Tools/Practice, mobile tutorials, all 40 tutorial-card/language combinations, ASCII export and production layouts. No page overflow or clipped visible buttons found. Browser console review found no errors. All eight language switches retain `/gte/local` and close the menu. Sample instrument/tuning options were inspected in Simplified Chinese.
- Production HTTP checks cover all 16 editor/export route/language combinations: native HTML language/direction and titles, selected dictionaries, unchanged guest IDs, shared canonical, private caching and noindex. Seven anonymous sign-in redirects preserve both language and project URL.
- The existing encrypted share-token tamper test was made deterministic after a random failure: it now flips an actual payload byte instead of replacing base64 characters that could represent the same bytes. Production token code was not changed.

Evidence: [layout checks](editor-layout-checks.json), [production checks](editor-production-checks.json), [editor screenshot](editor-review/chinese-editor.png).

Guest flows and native UI were manually reviewed; account-dependent actions were not exercised against a signed-in production account. Translation terminology and wording were reviewed in implementation; independent native-speaker review has not been performed. Initial parallel translators stopped at an account usage limit; their saved work was retained and the primary agent completed the remaining translations. No external paid translation service was used.
