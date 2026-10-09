# Multilingual search launch

English, Brazilian Portuguese, Spanish, and Japanese have independent, server-rendered URLs. Public pages use self-referencing canonicals rather than canonicalizing translations to English. Head and sitemap annotations use reciprocal `en`, `pt-BR`, `es`, `ja`, and `x-default` links. Spanish is language-wide, covering Spain and Spanish-speaking Latin America without duplicating identical country pages; Japanese uses `ja`. Root and legacy URL aliases redirect to one canonical path per language.

Completed languages are enabled and indexable by default in production. The existing `NEXT_PUBLIC_PT_BR_REVIEWED`, `NEXT_PUBLIC_ES_REVIEWED`, and new `NEXT_PUBLIC_JA_REVIEWED` switches can explicitly disable a language with `false`. Their legacy names are retained for compatibility; they are release switches, not evidence of native review. Preview/development pages remain noindex. No language release switches are currently configured in the project's production environment, verified with `vercel env ls production` on 9 October 2026.

Every edition has translated visible copy, headings, titles, descriptions, image descriptions, internal links, and localized page/article schema. Organization identity is shared. Private account/job/auth pages remain noindex and outside sitemaps. RSS discovery points to the corresponding translated feed. Blog source-revision manifests keep obsolete translations out of hreflang/sitemap recommendations; updated sources display English with noindex until retranslated. This preserves accuracy over advertising an outdated edition.

Browser/device language detection uses temporary, private, uncached redirects only on English public entry URLs. Direct translated URLs and explicit saved choices are retained. Crawlers are not language-redirected, and requests without language preferences receive English. Ordinary anchor links in the chooser make every edition discoverable without relying on geography or client-side translation.

Track Search Console impressions, clicks, queries, and landing pages by `/pt-br`, `/es`, `/ja` and visitor country. Compare equivalent acquisition periods, and separate branded/nonbranded searches. New language searches can increase acquisition even if existing English visitors did not show a conversion gap. Pair this with production PostHog funnels and positive paid invoices by language/country cohort, channel, and device. These observational language cohorts are not randomized A/B groups, and ranking or traffic gains cannot be guaranteed by implementation alone.

References:
- [Google: Managing multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Google: Localized versions and hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)

Independent native-language and legal copy review has not been performed for Japanese. Technical validation and user merge authorization do not substitute for that review.

## Verification

A production build and raw-HTML HTTP audit passed for all 192 indexable public language pages, 192 sitemap entries, and four XML feeds. Each page returned 200, the expected HTML language, a self-canonical, nonempty title/description, and all five reciprocal language/default links. Japan requests displayed ¥999 Premium pricing; Brazil retained R$21.90. The internship application deliberately remains noindex and outside the sitemap. Evidence: `seo-production-checks.json`. The 888-test suite includes independent release disabling, preview noindex, translated source revision guards, checkout return paths, and Japanese revenue attribution.
