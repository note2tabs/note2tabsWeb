# Customer email language audit — 2026-10-17

Release candidate: `codex/email-localization-ready-20261017`. No unsolicited customer emails were sent; one later authorized delivery test is documented below.

## Preference contract

`AccountLanguage` stores an authenticated account's language independently of analytics or email-marketing permission. The existing website language picker/settings remain the language control. Signup records its request language before issuing verification mail. Signed-in browsing initializes a missing preference from the current browser choice/site language, restores an existing account choice across devices, and explicitly selected changes update it. Initialization never replaces an existing account choice with a device's default English. Requests are serialized in the client so earlier changes cannot overwrite later choices.

Every customer mail sender resolves the recipient account's saved preference. If none exists, authentication/completion flows can use their request locale; background messages fall back to English. Country, currency and the sender's language are not proxies for a recipient's preference. An unknown sharing recipient has no known language, so English is the explicit fallback. Existing accounts with only a browser-stored preference must revisit to synchronize it; this migration cannot recover a preference that was never stored on the server.

Preference lookup failures fail the email operation rather than silently sending English. Completion and authentication resolve preference before claiming/invalidation of email/token markers, preserving retries during a lookup failure. There is no change to reminder permission, suppression, cooldown or experiment assignment.

## Audited coverage

| Customer email | Resolution and localization |
| --- | --- |
| Signup verification and resend | Account preference, request fallback; translated subject, body, verification action and expiry |
| Password reset | Account preference, request fallback; translated subject/body/action/expiry, reset code in HTML and plain text |
| Transcription finished | Account preference, request fallback; translated subject/body/action; recording label escaped |
| Existing inactive-signup reminder | Account preference; translated subject/body/action/unsubscribe |
| Existing saved-tab reminder | Account preference; translated subject/body/action/unsubscribe |
| Contextual experiment reminders | Same account preference as all other emails; value-specific localized copy |
| Premium trial start and ending | Account preference; localized dates, renewal/cancellation conditions and links |
| Pro activated | Account preference; translated features and action |
| Failed payment | Account preference; translated recovery period, consequences and payment action |
| Tab-sharing invitation | Recipient preference; translated viewer/editor permission, account instructions and privacy/block information |

All ten supported languages are covered: English, Spanish, Brazilian Portuguese, French, Italian, Polish, Japanese, Korean, Simplified Chinese and Arabic. Arabic messages set `dir="rtl"`; codes retain left-to-right direction. Localized destinations and preference/unsubscribe links retain the signed tokens. Removed stale Spanish/Portuguese completion-email claims that the editor is only in English. Internal staff-only internship notifications remain staff messages, not recipient/customer email flows.

## Stripe-owned messages

[Stripe documents customer preferred languages](https://docs.stripe.com/invoicing/customer#email-and-pdf-language-localization) for invoice/receipt emails and PDFs. Preferred locales are synchronized on verified account language changes, before existing-customer checkout, and after completed checkout. New billing customers receive their preferred locale **before** Checkout can generate the first invoice/receipt; creation has an account-level idempotency key. The school-access checkout is covered too. Checkout idempotency includes the chosen customer and locale to avoid replaying an old parameter set after this change.

Stripe's [supported invoicing languages](https://docs.stripe.com/invoicing/customize#customer-preferred-languages) omit Arabic: Stripe-generated Arabic-account billing messages explicitly fall back to English. Note2Tabs-owned emails still use Arabic. Simplified Chinese maps to `zh-CN`, not the site's `zh-Hans`. Stripe localization failures are logged and do not remove billing access or fail an existing customer's checkout; later checkout/completion can retry the sync. This does not retroactively translate messages already sent or finalized PDFs.

## Release and validation

Apply migration `20261017040000_account_language` before deploying these callers. Production was not modified. Test coverage exercises every customer template in all ten languages, escaping, RTL, reset codes, localized routes, signed opt-out links, account preference precedence, authenticated-account ownership, initialization semantics, completion retries, recipient-versus-sender sharing language, Stripe preference mapping/creation/update, and existing auth/reminder/billing flows. TypeScript and Prisma validation are required alongside the targeted suite.

The initial audit did not perform live SMTP/Stripe transactions; the later authorized SMTP test is documented below. Automated checks establish coverage and integration behavior; they do not substitute for native-speaker review or inbox/client rendering checks.


## Live French delivery and language guard — 2026-10-17

At the user's explicit request, changed their signed-in site's language to French using Settings, then sent **one** clearly labelled `[TEST]` French transcription-completion template to the email address displayed in their Account settings. No new transcription ran, no credits were spent, no password/verification tokens were issued, and no customer account was used. The real SMTP provider accepted it at 01:22:16 UTC (03:22:16 Stockholm), returned status **250**, and rejected no recipient. Private receipt evidence is `/tmp/n2t-french-email-smoke-receipt.json`. The user subsequently confirmed that the email arrived in French, including the requested text/button-label check. Provider acceptance and user-confirmed inbox receipt are separate evidence.

A reusable manual test lives at `scripts/tests/email-language-smoke.live.ts`; it is outside normal test discovery. To run deliberately, set `EMAIL_LANGUAGE_SMOKE_SEND=yes`, an explicitly authorized `EMAIL_LANGUAGE_SMOKE_TO`, and `EMAIL_LANGUAGE_SMOKE_ENV_DIR`, then run `npx vitest run --config scripts/tests/email-live.vitest.config.mjs`. Never automatically retry ambiguous SMTP timeouts. This test observes the real transport, not a mock delivery. It uses the actual French completion template and the selected locale; the new production AccountLanguage migration is still unapplied, so this was not a production test of the new database-backed selection path. Those account-selection paths are covered by integration/unit tests.

`sendTransactionalEmail` now requires explicit customer-template/language context (internal staff notices opt out explicitly). For known accounts it independently rereads the preferred language before handing mail to the provider. It validates the subject against that language's template, the HTML document language, Arabic direction, fixed localized body phrases, plain-text content, and selected action/security/footer phrases. It blocks inconsistent content before delivery, including English copy falsely marked `lang=fr`, a mixed English button in French content, a forgotten locale argument, missing language context and preference lookup failure. Dynamic song names/names/IDs/formats are intentionally not language-detected. This is deterministic template validation, not a guarantee that every translation is idiomatic or that every arbitrary added sentence is in the right language.

Mismatch errors become `EmailLanguageMismatchError` PostHog exceptions with `alert_eligible=true`, template, expected/rendered locale, validation reasons and `blocked_before_send` stage. No email addresses, subjects, bodies, filenames, reset codes or signed URLs are logged. If PostHog is unavailable, mail remains blocked and a minimal fallback warning is logged. Customer SMTP messages also carry `Content-Language` and `X-Note2Tabs-Template` headers.

Verified the existing enabled **Note2Tabs actionable errors or retention email failures** alert (01a05a46-45dc-0000-b434-650a577abe36) on insight [YIsrN83Y](https://eu.posthog.com/project/208789/insights/YIsrN83Y): its hourly trailing-hour query includes `$exception` events with `alert_eligible=true`, with threshold above zero. It already delivers to the existing Note2Tabs monitoring inbox, so no duplicate alert or new destination was created. Tests deliberately inject mismatches, assert provider delivery never runs, and verify the exact actionable exception properties used by that alert. A synthetic production alert was not emitted and no claim of a live alert notification being delivered is made. The guard code needs the normal release/migration before protecting real production sends.

Stripe-owned invoice/receipt emails are outside `sendTransactionalEmail`: preference updates/creation now verify Stripe’s returned locale and raise an actionable `StripeEmailLanguageError` on mismatch or API failure. The intentionally supported Arabic-to-English provider fallback is checked against the configured provider locale. This cannot inspect the actual body rendered by Stripe.

Final validation: 251 automated tests across 31 files passed; TypeScript and `git diff --check` passed. The single opt-in real-SMTP French test also passed, with inbox receipt confirmed by the user.


## Localization release validation

The merge candidate contains customer-email localization/guards, account-language persistence and `/gte/local` language continuity. It excludes the engagement rules engine, new experiment APIs/providers, behavior collection, new CTA timing, and dynamic reminder dispatch. Existing reminder schedules and selection remain in use with localized content.

Validated against main `60032fa2`: **1,439 tests in 198 files passed**, TypeScript passed, and a production Next.js build passed. The old test that required a remembered Japanese editor language to be discarded for browser Spanish was updated to the intended continuity behavior. Only migration `20261017040000_account_language` was pending in the current production database; it was applied successfully before merging, and Prisma then reported the schema up to date. No engagement/experiment migrations were applied.
