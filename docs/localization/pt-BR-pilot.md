# Brazilian Portuguese site localization

Branch: `codex/pt-br-localization-pilot`, based on `origin/main` at `b0bdb29a`.

## Commercial hypothesis

Brazilian Portuguese is the first experiment. Brazil combines a substantial music audience, lower English proficiency, an existing BRL price catalog, and evidence that Brazilian visitors already use transcription. The additional opportunity is Portuguese-only discovery: current English visitors are a biased sample of the audience a translated site could reach. Neither existing traffic nor country music revenue proves willingness to pay for Note2Tabs.

The earlier PostHog review found 242 Brazilian visitors, 86 signup users, 92 transcription-start users, 81 transcription-success users and 5 pricing-page users in July 10–October 7, 2026. These are independent unique-user counts, **not** an ordered funnel or paid conversion rate. Search Console queries and live Stripe subscription revenue were unavailable. Server-event geography was unreliable. French remains the next candidate to assess after this pilot supplies payment evidence.

## Implemented scope

| Surface | Portuguese route |
| --- | --- |
| Landing page | `/pt-br` |
| Audio / YouTube transcriber | `/pt-br/transcribe` |
| Pricing | `/pt-br/pricing` |
| Login, signup, verification | `/pt-br/auth/...` |
| Password reset | `/pt-br/reset-password`, `/pt-br/reset-password/[token]` |
| Transcription progress | `/pt-br/job/[job_id]` |
| Checkout success | `/pt-br/premium/welcome` |
| Editor landing and feature guides | `/pt-br/editor`, `/pt-br/features`, `/pt-br/features/[slug]` |
| Product guides and converters | `/pt-br/audio-to-guitar-tab-converter`, `/pt-br/mp3-to-guitar-tabs`, `/pt-br/youtube-to-guitar-tabs`, `/pt-br/ai-guitar-tab-generator`, `/pt-br/free-guitar-tab-maker` |
| Workspace, sharing, settings and history | `/pt-br/home`, `/pt-br/shared`, `/pt-br/settings`, `/pt-br/tabs/...` |
| About, contact and legal pages | `/pt-br/about`, `/pt-br/contact`, `/pt-br/terms`, `/pt-br/privacy` |
| Affiliates and internship application | `/pt-br/affiliate-program`, `/pt-br/affiliate`, `/pt-br/internship-application` |
| Published blog, archives and RSS | `/pt-br/blog/...` |
| Email preferences | `/pt-br/email/unsubscribe`, `/pt-br/email/share-preferences` |

Shared navigation, conversion prompts, billing FAQs and checkout-cancellation feedback are translated. Verification, reset and transcription-completion emails accept a validated locale; names and recording titles remain escaped user content. Stripe Checkout receives `pt-BR`, with locale-preserving success/cancel links and localized account handoffs. No price IDs, payment methods, entitlements or billing rules are changed.

English and Brazilian Portuguese are the supported website languages. All public and account surfaces are translated; the interactive `/gte` editor and its library remain English. Their navigation retains the chosen language when returning to translated pages. Internal admin/moderation tools remain English. Support is offered via the existing address; Portuguese-speaking support is not promised. Existing subscription-lifecycle/trial marketing emails remain English and are outside this website expansion.

The 26 published blog articles have file-backed Portuguese editions in `lib/i18n/blog/pt-BR`. These editions follow the original structure and meaning with more concise Portuguese phrasing. Bibliographic titles and English editor control names remain recognizable. Each edition records the English source revision. Updated or new articles fall back to the original, visibly marked language, until a corresponding translation is added. Stale translations are excluded from Portuguese article sitemap pairs. Article bodies compile through the existing sanitizer on the server; no blog database content is changed. New translations, including legal text, remain draft copy subject to the existing native/legal review gate.

## Run and release gate

For local preview, run `npm run dev -- --port 3108` and open `http://localhost:3108/pt-br`. Development uses the repository's existing local/no-database behavior unless configured otherwise. For a production-mode preview, build and start with `VERCEL_ENV=preview`. This worktree shares a symlinked dependency directory, so build it with `VERCEL_ENV=preview npm run build -- --webpack`.

Draft pages are available in development and Vercel preview, with `noindex` in page metadata and response headers. Normal production returns 404 and hides the Portuguese selector until **`NEXT_PUBLIC_PT_BR_REVIEWED=true`** is explicitly configured and the application is rebuilt. Preview deployments remain noindex even with the review flag enabled. Account and job routes stay noindex after release.

The flag is a release assertion, not proof of a review. No native-speaker or legal/billing sign-off has occurred in this implementation. Do not enable it merely to expose a preview. Production deployment and publication are outside this branch task.

After review, translated public pages get self canonicals, reciprocal `en` / `pt-BR` / `x-default` links, and sitemap annotations. English URLs remain the originals. Only existing translated routes can receive `/pt-br`; unsupported pages retain their English URLs. This follows [Google's localized-page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions). There is no language redirect based on IP or browser language.

## Translation review

UI source messages are in `lib/i18n/en.json`; drafts are in `pt-BR.json`. Keys are the trimmed English message; interpolation uses named `{parameters}`. Email builders in `emailVerification.ts`, `passwordReset.ts` and `transcriptionCompleteEmail.ts` contain both versions and must be reviewed together with the UI. Update the locale version when changing an experiment's content materially.

| Term | Draft convention |
| --- | --- |
| Note2Tabs, Premium, Pro | Preserve product/plan names |
| Light / Heavy | Preserve model names; use “modelo Light / Heavy” |
| tabs / tablature | tablaturas; reserve “aba” for a browser tab |
| transcription | transcrição; distinguish it from manual editing |
| credits | créditos; preserve actual numeric costs and limits |
| fret / fingering | casa / digitação |
| guitar | guitarra; review when “violão” is also accurate for the input |
| Free plan | Grátis |

Use direct, natural Brazilian Portuguese with “você.” Do not promise perfect transcription, Portuguese support staffing, Pix availability, or a free trial that the billing configuration does not actually offer. Preserve warnings about ownership, public URLs, recordings and uploads.

Before release, a native Brazilian guitar player should review the full public/signup/transcription/checkout journey and email previews. A billing reviewer must verify displayed monthly/yearly prices, credit costs, rollover caps, actual charge currency, taxes, renewal and cancellation copy against Stripe test mode. Review failed checkout, expired verification/reset links, upload-size gates and Google login errors. Portuguese legal drafts require a separate qualified review before release.

Language is separate from currency. Brazilian formatting uses decimal commas through `Intl`; BRL is selected by existing country/currency preference, not by choosing Portuguese. SSR pricing and structured data share the same currency. A browser language choice is saved for 30 days in `n2t_locale` and in local storage when selected; it is not an account-level cross-device preference. Completion email locale comes from the authenticated final-status request. A future background completion sender needs a durable account/job preference.

## Measurement and decisions

Client page and funnel events carry `content_locale`, `locale_source` and `locale_version`. Selection emits `language_selected`. Existing acquisition, model, device and currency properties remain available. Checkout metadata stores locale, visitor country and device; Stripe checkout/subscription events preserve them. `subscription_payment_succeeded` is emitted for positive paid invoices and includes invoice ID, exact `amount_paid_minor`, currency and renewal status. A trial activation is not a paid conversion. Do not add amounts across currencies without conversion. Country can remain unknown when the deployment does not supply it.

Use first paid invoice per user/invoice as the paid endpoint, separating renewals. Build an ordered, same-user funnel: localized landing → signup → verification → transcription start → success → pricing → checkout → positive paid invoice. Compare Portuguese and English users from Brazil within acquisition channel, device and currency. Also measure **new Portuguese organic queries/impressions and new customers** in Search Console: conversion uplift alone cannot quantify newly reachable demand. Query-level acquisition evidence remains a launch prerequisite for evaluating SEO expansion.

Start with this one locale after review. Suggested decision rules (hypotheses, not statistically derived promises):

- Collect at least four weeks and 100 checkout handoffs; extend observation if paid volume is too low to resolve uncertainty.
- Expand only if contribution revenue per Brazilian acquired user improves, newly reached Portuguese organic customers appear, and completion/error/support guardrails hold. Report intervals and channel mix, not only a percentage uplift.
- Investigate or pause if transcription completion falls over 5 percentage points, checkout-to-paid drops over 20% relative to comparable English traffic, or support contacts per active user rise over 25%. Low samples trigger investigation, not an automatic statistical conclusion.
- Revert immediately for broken charges, privacy exposure, severe inaccurate copy or broken authentication. Remove the review flag and rebuild to restore the production gate; keep English URLs and data intact. Remove localized acquisition links from campaigns and wait for sitemap caches to expire.

## Validation and remaining limits

132 tests across nine focused unit/integration suites pass; the optimized Next.js preview build includes TypeScript checking. Automated checks cover catalog/placeholder parity, locale routes, checkout resume/cancel destinations, Brazilian price formatting, email escaping and links, review gating, and prefixed sensitive-route replay/privacy protection. Existing pricing, email, analytics and welcome tests run alongside them. Production and preview builds are checked separately; normal production was checked to return 404 for the unreviewed Portuguese pilot.

No external account was created, no email was sent and no paid Stripe transaction was executed during local QA. Live Google OAuth, email delivery, Stripe test-mode tax/payment-method behavior and native-speaker review still require the configured staging environment. The implementation creates no database schema or production data changes.

### Expanded site validation (October 8, 2026)

The expansion passes 132 tests across nine focused suites covering localization, source revision checks, article compilation and TOC anchors, redirects, billing portal returns, existing Brazilian price catalog behavior, authentication and job access. The preview production build passes with Webpack and TypeScript. Static translation calls have complete matching English/Portuguese catalog coverage.

The blog source was read from published content only. No database writes, emails, purchases or live account changes were performed. Account-specific authenticated views are covered by code review and mocked authorization/billing tests, not a real signed-in account. Native-language and legal review remain pending.

Browser QA covered 342 page/viewport combinations: 31 site templates and all 26 articles, in English and Brazilian Portuguese at 320px, 820px and 1440px. No document overflow or clipped action buttons was found. The editor landing page feature headings and descriptions, and workflow headings and descriptions, share measured row positions on desktop. All translated articles rendered Portuguese bodies and self canonicals. Desktop and mobile editor landing screenshots are saved beside this document.

The final navigation check opened the blank `/gte` editor from `/pt-br/editor`, returned home, and reached the Portuguese transcriber. Selecting English switched the page and links to English and closed the chooser. The shared desktop editor heading was checked again in both languages at all three widths. Screenshots: `pt-br-editor-desktop.jpg` and `pt-br-editor-mobile.jpg`.
