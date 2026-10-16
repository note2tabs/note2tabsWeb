# French and Italian review editions

The follow-up [16 October audit](audit-20261016.md) records corrections to this draft, current validation, currency parity and ongoing conversion monitoring. The results below describe the original draft, not final linguistic approval.

Branch: `codex/french-italian-localization-20261014`, based on main after PR #196. Neither edition is merged, published, submitted to Search Console, or claimed to be indexed.

## Scope

Each edition includes all 1,768 public-interface messages and 986 lazily loaded editor messages. There are 41 page wrappers and one RSS wrapper per language, using the existing page loaders and authorization rules. French uses `/fr`; Italian uses `/it`. Editor project URLs stay shared and use the saved/device language.

Language settings and selectors, device-language detection (including regional French/Italian tags), navigation/auth return paths, editor counts, dates/numbers, Stripe locales, transactional verification/reset/completion emails, and analytics cohorts support both languages. Existing market prices and product limits are unchanged; France and Italy continue to use the existing EUR price configuration. Language choice itself does not change a visitor's pricing country.

Copy was drafted locally with an offline Argos/OPUS translation model, then revised for the conversion funnel, pricing, account/navigation labels and editor terminology. Important vocabulary includes French `tablature`, `mesure`, `accord`, `tonalité`, `case`, and Italian `tablatura`, `battuta`, `accordo`, `tonalità`, `tasto`. The longer-message pass translates sentences separately to avoid losing follow-up instructions. Placeholders and technical file extensions are preserved. No paid translation/model API was used.

These are review editions: complete catalogue coverage is not a claim that every sentence has received independent native-speaker review. Native-speaker and legal-copy review have not been performed. The release switches intentionally remain off by default.

## Search and release behavior

Set `NEXT_PUBLIC_FR_REVIEWED=true` and/or `NEXT_PUBLIC_IT_REVIEWED=true` in the build/runtime environment only when ready to release. Development and Vercel preview environments expose the editions for review and keep them noindex. Production defaults to unavailable routes, hides these choices, and excludes their hreflang/sitemap entries until explicitly enabled.

When enabled, the existing SEO system emits translated titles/descriptions, self-canonicals, reciprocal hreflang and locale metadata. Private/authentication flows remain noindex. Source-matched blog translations have not been authored for these two languages: article bodies remain English, with English canonical/language and noindex on the localized fallback. A generic translated notice now describes that fallback without incorrectly referring to Portuguese. No French/Italian blog translation is advertised through the article translation availability registry.

## Validation

- 184 suites / 1,076 tests pass. Coverage includes both complete catalogues and exact interpolation placeholders, musical counts, all-language editor rendering, return-path/privacy behavior, release gating, Stripe locales, and source-matched article availability.
- TypeScript and the production build pass. The isolated build has no database credentials and uses the existing public-statistics fallback.
- 28 development HTTP checks: successful responses, HTML language, translated titles, canonical paths and noindex for review pages.
- 28 production-mode HTTP checks with the two release switches temporarily enabled: successful responses, HTML language, canonical paths, all ten language alternatives on public pages, and private-page noindex. Country headers for France and Italy render EUR pricing.
- Browser checks: saving French and Italian through language settings; French pricing on desktop; French homepage and Italian pricing at 390px. The checked mobile pages have no document-width overflow. Core account actions, purchases and paid transcriptions were not submitted.
- The original local browser language preference and viewport were restored. Temporary test servers were stopped after verification.

The unfinished landing-page redesign is separate from this branch.

Translation engine reference: [Argos Translate](https://www.argosopentech.com/).
