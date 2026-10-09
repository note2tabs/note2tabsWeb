# Spanish localization experiment

Branch: `codex/pt-br-localization-pilot`, extending the branch based on main. Spanish uses `/es` and `hreflang="es"` as a broadly understandable language edition. Country and currency remain separate from language.

## Implemented coverage

Spanish mirrors the Portuguese website: homepage, transcriber, pricing, editor landing, six feature guides, five converter/product pages, about/contact/legal pages, affiliate pages, internship application, blog and archives, RSS, authentication/reset/verification, job progress, premium welcome, workspace/history/sharing/settings, and email preferences. The 26 published articles have server-compiled, file-backed Spanish editions. They retain the source meaning with concise wording and preserve citations and English editor control names.

The interactive `/gte` editor and library remain English. Their navigation returns to the selected website language. Names, email addresses, affiliate codes, user tab names, uploaded audio and opaque tokens are not translated. Verification, password-reset and completion emails support Spanish; existing marketing/subscription-lifecycle emails retain their earlier scope.

The chooser closes on selection, outside click, Escape and navigation. Layouts are shared across the three languages. Short action labels preserve the original control dimensions; content rows use natural sizes for alignment. Currency selection, price IDs, charges, credits, rollover and limits use the existing catalog. Choosing Spanish does not force EUR or create a new Latin American price.

Article translations record source title and revision. Updated/new sources fall back to English with a translated notice and noindex until a matching edition exists. Independent revision manifests prevent advertising stale Spanish or Portuguese alternatives. Public canonicals and reciprocal language alternates point to each matching page/article. Private routes remain excluded from indexing and session replay.

## Tracking separation

Events retain their existing names so the same funnel can be broken down consistently:

| Property | Examples / purpose |
| --- | --- |
| `content_locale` | `en`, `pt-BR`, `es` |
| `visitor_country` | `BR`, `ES`, `MX`, `AR`, or `unknown` |
| `visitor_market` | `brazil`, `spain`, `spanish_latin_america`, `other`, `unknown` |
| `localization_cohort` | `pt-BR:BR`, `es:ES`, `es:MX`, `en:MX` |
| `locale_version` | `multilingual-site-3` on website events and new transcription outbox records |
| `environment` | Filter to `production`; exclude preview/development |

Browser event ingestion derives content language from the event path and country from trusted edge geography. It discards client-supplied country/market/cohort claims. Missing geography remains unknown; Spanish language never implies Spain or Latin America. Exact countries remain separate even in the Latin America market group. `/gte` has English content; the existing `preferred_locale` helps distinguish a Spanish navigation choice there.

New transcription jobs durably store language/country context in the existing analytics outbox. Delayed success/failure events retain it. Checkout metadata stores the originating locale/country; Stripe subscription and positive paid-invoice events reconstruct the same cohort. A zero-cost trial activation is not a paid conversion. Existing records are not backfilled or relabeled.

Measure acquisition in Search Console by language URL prefix, query and country: new impressions, clicks, queries and users. Separately measure signup → verification → transcription start → success → pricing → checkout → first positive paid invoice. Compare Spanish and English within the same country, acquisition channel and device. Use Brazil separately, Spain separately, and each Latin American country separately before any regional total. Language choice is observational; these cohorts are not a randomized A/B test and do not establish causality by themselves.

Revenue must use `amount_paid_minor` and `currency`, with first payments separated from renewals. Do not sum different currencies or assume every currency uses two decimal places. Production-only events can be grouped by `localization_cohort`, event name and currency in PostHog. Search Console supplies the SEO acquisition evidence; visitor conversion alone cannot measure previously unreachable searches.

## What the release review means

The implementation and automated validation are complete on this branch. The remaining review concerns copy and configured payment behavior:

- A fluent Spanish reader should check natural wording, guitar terminology and the meaning of warnings on the main journey and article drafts. This is translation review, not a request to inspect code.
- A qualified reviewer should compare Spanish terms/privacy against the English source; translated drafts do not create new legal terms or support-language promises.
- In Stripe test mode, verify displayed currency and monthly/yearly totals, renewal/cancellation wording, tax/payment-method behavior and the localized return path. The existing prices have not been changed.

Development and preview expose drafts with noindex. Production release is independent: `NEXT_PUBLIC_ES_REVIEWED=true` enables Spanish after rebuild; `NEXT_PUBLIC_PT_BR_REVIEWED=true` controls Portuguese separately. Previews stay noindex even with flags. Neither production deployment nor live purchases/emails/account changes are part of this implementation task. SEO measurement begins after reviewed public pages are deployed and indexable.

## Validation

176 tests pass across 13 focused localization, pricing, authentication, checkout/webhook, analytics ingestion/outbox and redirect suites. The optimized preview build includes TypeScript checking. Dynamic feature paragraphs and metadata are checked for catalog coverage in both Spanish and Portuguese. Authenticated account views are covered by code and mocked tests, without a live account.

Browser QA: 31 templates across three languages at 320px, 820px and 1440px passed 279 checks with no document overflow or clipped action buttons. All 26 articles across the same three languages and widths passed another 234 checks: translated body language matched the page language, headings rendered, and no document overflow occurred (513 page/viewport checks in total). The Spanish editor → English `/gte` → Spanish home → Spanish transcriber journey passed. Switching through English, Portuguese and Spanish preserved the transcriber route and closed the chooser. Screenshots: `es-editor-desktop.jpg`, `es-pricing-desktop.jpg`, and `es-transcriber-mobile.jpg`.

Build this symlinked worktree with `VERCEL_ENV=preview npm run build -- --webpack`. Current local preview: `http://localhost:3109/es`.

## Compact-control correction

Removed localization overrides that stretched the input switch, changed shared action-row layout, forced arbitrary word breaks, and added pricing-toggle padding. The input switch retains the original padding and 48px overall height at 320px, 820px and 1440px in all three languages, in both audio and YouTube modes. Shortened Portuguese/Spanish action labels instead of enlarging controls. Reviewed 31 public templates across those languages and widths (279 checks), then rechecked changed homepage/editor labels and all nine YouTube-mode combinations. No page overflow or clipped action buttons. The three focused localization suites pass (31 tests). Authenticated account actions retain their existing CSS dimensions and were inspected in source; no live account mutations were performed.

## Device language and merge validation

The proxy selects the highest-priority supported device language from the browser’s `Accept-Language` header on public English website entry routes. Portuguese variants use Brazilian Portuguese; Spanish variants use Spanish; English and unsupported languages use English. A saved explicit language choice wins, including English. Direct translated URLs stay in their requested language. Redirects preserve query parameters, including acquisition and transcription-resume context, are temporary and private/non-cacheable, and leave currency selection based on the existing country/preference rules. Search crawlers keep canonical English entry URLs; APIs, private account/token routes and `/gte` are not automatically redirected. Only enabled languages are eligible, so production release gates still apply.

Merge validation: 254 tests passed across 17 suites, including device preference precedence, fallback/release gating, saved English choice, crawler/private-route preservation, query preservation, currency independence, current model defaults and credits, and standalone promotions. Existing local-main changes were compared with the current remote implementations while resolving duplicate-implementation conflicts.

## Launch update — 9 October 2026

Japanese is now implemented, and completed editions ship in production by default after the authorized merge. The old reviewed flags are retained as optional per-language disable switches (`false`); no production override is currently configured. Previews stay noindex. See [multilingual SEO](multilingual-seo.md) and [Japanese implementation](ja-pilot.md) for current release and validation details.
