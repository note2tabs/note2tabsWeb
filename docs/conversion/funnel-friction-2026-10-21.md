# Purchase-funnel friction review — 21 October 2026

## Scope and limits

Reviewed production PostHog event histories, ordered unique-person funnels, popup/pricing/Stripe Checkout integration code, and published usability research. The two targeted replay lookups returned `recording_not_found`; findings below are based on event timelines and code/tests, not a claim to have watched recordings. No new Replay Vision scans, live purchases or customer-account changes were performed. No randomized experiment exists for these changes, so no conversion lift is claimed.

## Corrected measurement

The native PostHog test-account filter did not remove two confirmed internal profiles. One includes the authorized owner's test-account ID; the other is the owner's ADMIN account. Explicitly excluded both from the following diagnostic funnels. Do not assume historic dashboard totals are free of internal QA simply because `filterTestAccounts` is enabled.

22 September–20 October, ordered within 24 hours:

- Pricing → checkout → subscription activation: **385 → 16 → 9** (pricing → checkout 4.16%).
- All checkout starters → subscription activation: **20 → 11** (55%).

7–20 October, ordered within 24 hours:

- Successful transcription → pricing → checkout → subscription: **965 → 52 → 8 → 5**. Of those reaching pricing after success, 15.38% started checkout.
- Blocked submission → pricing → checkout → subscription: **482 → 26 → 3 → 2**. Block reasons include authentication/validation, not just paid limits.

These are tracked people, not every account or every Stripe session. Subscription activation is not necessarily collected cash; trials and discounts can exist. Existing subscriber visits and traffic intent differ between groups. Differences are observational, not causal proof of the value of transcription or a pricing-page defect.

For the fixed 14–20 October window, nine of thirteen recorded expiries and all seven recorded cancel returns were associated with those internal profiles. A payment-action-required event belongs to a user who subsequently activated a subscription. There is no demonstrated widespread card-decline problem in this sample. Absence of observed failures is not proof all payments work.

## Reproduced and fixed: popup interrupts recovery

The dialog's reset key included clip duration, credit requirement and current balance. Editing the selection after dismissing the dialog changed the key and opened it again, even for a file-size problem that had not changed. A zero-balance passive `credits_low` warning also reopened despite there being no new submit attempt.

A regression test first failed by observing the dismissed file-size dialog reopen after the clip changed from 60s to 30s. The fix keys presentation to the reason, plan, selected-file size and explicit submit-attempt counter. Descriptions and quoted requirements can still update while the dialog is open. A new blocked submission still opens the dialog. Passive low-credit notices remain nonblocking, including zero balances until the user tries an action.

This also avoids counting edits to a single open dialog as new exposures via the previous over-sensitive key. It does not establish that all repeated events in historic data were duplicates; repeated blocked attempts are real separate exposures.

## Observed and fixed: repeated upload before a known credit rejection

A Simplified Chinese user attempted a file transcription five times between 14:04 and 14:08 UTC on 21 October. Each sequence included upload presign, successful upload and a server `credits_exhausted` rejection. Upload waits were approximately 10–20 seconds. The user repeatedly dismissed the popup and retried. This demonstrates a frustrating failure/recovery loop; it does not tell us whether they refused to pay because of price or another reason.

Both homepage and transcriber now refresh `/api/credits` before uploading **only when the cached balance is insufficient** for the selected model/duration. A fresh insufficient balance opens the contextual credit dialog immediately. Reset or newly purchased credits are honored. Healthy, unknown and unlimited balances, and zero-cost Heavy previews, add no request. Invalid responses, request errors or a bounded timeout leave the original authoritative server path available rather than blocking on stale data. The transcription API still performs the final authorization/deduction. Concurrent submissions remain guarded.

## Reproduced in code and fixed: Pro-only handoff recommends Premium

Limit dialogs already select Pro for files too large for Premium, then link to pricing with `plan=pro`. The pricing page ignored that selection for its recommendation and highlighted Premium. The page now recommends Pro for a Pro-targeted handoff and for Premium subscribers considering an upgrade, subject to the existing Pro feature flag. Existing credit-proration discount badges take precedence. Ordinary Free/guest pricing continues to recommend Premium. No price, billing cadence or payment logic changed.

## Checkout decision

Retain the current Stripe-hosted integration. The existing code uses Checkout Sessions, dynamic payment methods (no explicit allowlist), localized currency/locale, existing-customer reuse, customer email for new subscribers, and no extra required phone/address/custom fields configured in this request. The current return screen already offers retry and a path back.

No evidence justifies adding checkout fields, removing payment methods, changing discounts, changing tax collection, replacing Stripe, or introducing another overlay. The available histories cannot reveal field-by-field behavior on Stripe's hosted page, and users have not submitted an abandonment reason in the sampled taxonomy. Price objection, insufficient perceived accuracy, unavailable preferred payment method and mere comparison shopping remain hypotheses.

## Research and applicability

- Nielsen Norman Group, *Modal & Nonmodal Dialogs*: modal interfaces interrupt the current task; use when immediate action is necessary. Supports respecting dismissal during edits while retaining a dialog for a fresh blocked submit. General usability guidance, not a measured B2C SaaS conversion uplift: https://www.nngroup.com/articles/modal-nonmodal-dialog/
- Nielsen Norman Group, *Popups: 10 Problematic Trends and Alternatives*: interruptions and timing can disrupt the task. Supports fixing repeated presentation, not making all paywalls nonmodal: https://www.nngroup.com/articles/popups/
- Baymard, *Checkout UX 2025*: large-scale checkout research supports reducing unnecessary barriers and fields. Ecommerce population differs from a music-transcription subscription product; do not transfer its abandonment benchmark or advertised uplift to our funnel: https://baymard.com/research-articles/current-state-of-checkout-ux
- Baymard, *Reduce Cart Abandonment*: transparent costs and avoiding unnecessary account friction matter, but merely viewing prices does not establish purchase intent. Our sample does not demonstrate a new cost surprise; no speculative checkout rewrite was made: https://baymard.com/blog/reduce-cart-abandonment

## Validation and follow-up

Focused tests cover dismissal/edit/retry behavior, zero-balance passive warnings, fresh/adequate/unlimited/free-preview credits, credit refresh failures/timeouts, Pro-only pricing recommendations, existing pricing, popup tracking and currency formatting. TypeScript passes. Browser-checked the actual local pricing route with `plan=pro&reason=pro_file_size_limit`, verifying that Pro receives the recommendation and black CTA while Premium remains available.

Continue measuring unique exposed people separately by limit type. Monitor popup → pricing/checkout and return-to-product behavior; a dismissal is not itself churn. Keep internal QA separate when evaluating outcomes. Do not claim a change caused a conversion improvement from a handful of users or an unmatched before/after comparison.
