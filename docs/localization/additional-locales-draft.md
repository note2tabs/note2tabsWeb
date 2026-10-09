# Korean, Polish, Arabic and Simplified Chinese localization

Branch: `codex/additional-locales`, from `main` at `57f24ff8`.

Implementation and automated/browser review are complete. These four languages have not been merged, deployed, submitted to Search Console or verified as indexed. Existing production languages remain English, Brazilian Portuguese, Spanish and Japanese until this branch is released.

## Coverage

- All 1,753 catalogue strings in each language, including pricing, features, authentication, account flows and legal pages. Interpolation placeholders are checked against the English catalogue.
- All 26 existing blog guides in each language: 104 new translations, with source-title/revision guards, internal links and scientific citations retained. Updated English articles fall back to English with noindex rather than silently displaying an outdated translation.
- 42 route wrappers per new language, using shared page loaders and authorization: `/ko`, `/pl`, `/ar`, `/zh-hans`.
- Native language chooser names, close-on-selection behavior, preferred-language persistence, device-language negotiation and localized return links. Traditional Chinese device preferences do not automatically select Simplified Chinese. Interactive `/gte` remains English and left to right, while navigation retains the chosen language.
- Verification, password-reset and transcription-completion email copy; escaped user values, native account links and Arabic direction. Security wording and guitar terminology received a second translation pass.
- Arabic right-to-left layout, mirrored pricing markers and article indentation, and left-to-right isolation for musical previews, code, audio and numeric/email/URL fields. Long FAQ questions keep their expand icon beside the text.
- Existing UI dimensions retained. Upload/YouTube switch stays 48px high. Existing country-based price amounts are authoritative and unchanged; tested monthly Premium amounts include KRW 7,900, PLN 19.99, CNY 30, BRL 21.90 and JPY 999. Language controls number/currency formatting, not the price market. Arabic checkout uses Stripe's supported automatic locale; Simplified Chinese maps to Stripe `zh`.
- Separate language/country analytics cohorts, including Korean, Polish, Chinese and Arabic-speaking markets; exact visitor country remains available for comparisons. No live experiment results are claimed.

## Search support

Translated pages have native titles/descriptions, self-canonicals and reciprocal `hreflang` links for `en`, `pt-BR`, `es`, `ja`, `ko`, `pl`, `ar`, `zh-Hans`, plus English `x-default`. Language-specific sitemap entries, article metadata and RSS feeds include completed, matching translations. Crawlers can access language routes without device-language redirects. Authentication/private flows and previews remain noindex.

This makes the translated content discoverable for language-specific searches; it does not guarantee indexing or rankings. Google Search Console checks/submission are a separate post-deployment step. The earlier production indexing audit is not completed by these local checks.

## Validation

- 907 tests pass in 170 files, including all 104 guide compilations, source revision guards, catalogue completeness/placeholders, route/privacy behavior, device preferences, email escaping, supported Stripe locales and price-market regressions.
- TypeScript passes. Next.js production Webpack build passes. Diff whitespace check passes.
- Local production HTTP checks pass for 384 public pages: status, HTML language, title/description, self-canonical, all reciprocal alternatives and indexability. Sitemap has 384 entries and all eight RSS feeds parse. Production language negotiation, saved choices, crawler access, private-flow noindex and country-specific prices pass.
- 356 browser layout measurements: eight core pages in each new language at 390/768/1440px; four core pages in each existing language at those widths; all remaining 47 public/guest-flow pages and guides per new language at 390px; final production editor/pricing/transcriber checks in all eight languages. No page overflow or clipped visible buttons found; mode switches remain 48px high. Authenticated account screens were not manually exercised with a live user account.
- Language chooser closes after Arabic-to-Chinese selection; `/gte/local` renders in English and returns to `/zh-hans/transcribe`.

Evidence: [SEO checks](additional-locales-seo-checks.json), [layout checks](additional-locales-layout-checks.json). Arabic pricing screenshot: `/tmp/n2t-localization-review/arabic-pricing-mobile.png`.

The user explicitly authorized parallel translation work. Three agents translated distinct Korean/Polish/Arabic files; the primary agent handled Chinese, integration and validation. No external paid translation service was used. Translation and terminology were reviewed during implementation; independent native-speaker/legal review has not been performed.
