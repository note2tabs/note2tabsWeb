# Additional locale drafts

Branch: `codex/additional-locales`, from `main` at `57f24ff8`.

User requested Korean, Polish, Arabic and Simplified Chinese (confirmed). This is unfinished work and is not ready to merge or deploy.

Implemented so far:

- Locale identities `ko`, `pl`, `ar`, `zh-Hans`; route prefixes `/ko`, `/pl`, `/ar`, `/zh-hans`.
- 42 shared route wrappers per language, preserving existing page loaders and authorization.
- Native language chooser names and accessible labels, existing close-on-selection behavior, URL/cookie preference, return-link preservation, device language negotiation.
- Traditional Chinese preferences do not automatically redirect to Simplified Chinese. Existing English-only `/gte` retains the selected navigation language and left-to-right layout.
- Shared canonical, hreflang, sitemap and Open Graph support. Untranslated article revisions are not advertised as translated articles. New blog registries still need translated content and revision manifests.
- Language/country cohorts and separate Korean, Polish, Chinese and Arabic-market tracking. Existing country-based prices remain authoritative: KRW 7,900, PLN 19.99, CNY 30 and BRL 21.90 monthly Premium amounts are unchanged.
- Stripe language mapping: Simplified Chinese maps to Stripe `zh`; Arabic uses Stripe automatic locale because the installed Stripe SDK does not support `ar`.
- Four verification, password-reset and transcription-completion email drafts, with escaped names/labels and Arabic email direction.
- Arabic HTML direction on server render and client navigation, scoped layout adjustments and left-to-right isolation for musical previews, numeric/URL/email inputs, code and audio.
- First 290 of 1,753 catalogue strings translated in each new language, covering the main transcription funnel, editor landing introduction, primary pricing and account sign-in/verification copy.

Validation so far: 898 tests in 170 files pass; production Webpack compilation succeeds. TypeScript and diff whitespace checks pass. This validates the shared implementation, not translation completeness or visual fit.

Remaining work:

1. Translate the remaining 1,463 strings per language; preserve interpolation placeholders, plan limits, legal/product meaning, proper names and editor command names. Avoid word-by-word fragment translations where complete translated phrases are needed.
2. Translate all 26 blog articles per language, retaining original source titles/revisions and links, and add registries/revision manifests without stale English-content SEO alternatives.
3. Review wording and terminology consistently, including short action labels and Arabic mixed-direction values.
4. Test catalogue completeness and placeholders, article compilation/revision guards, structured metadata and all supported locale routes.
5. Browser review at mobile, tablet and desktop widths, including existing English/PT-BR/Spanish/Japanese regression checks; preserve upload/YouTube switch and button sizing, language-menu closure and editor-to-transcriber navigation.
6. Update documentation with final evidence before marking the branch ready. No live translation release, Search Console submission or merge has happened for these four languages.

An asynchronous question asks for explicit permission to use parallel translation agents; it has not been answered at the time of this note. Do not start sub-agents without that authorization. If granted, allocate independent language catalogue/blog files to each agent and keep shared infrastructure changes with the primary agent.
