# Premium trial retention audit — 2026-08-29

## Executive decision

Do not change the seven-day trial, price, credits, or cancellation difficulty from the current five-user sample. Prioritize getting a trial customer from transcription into a saved tab, Practice, and a second-day return; make billing completely predictable; distinguish voluntary cancellation from failed payment; and collect the reason for cancellation.

## What the current data says

PostHog contains five unique `subscription_started` users in the last 180 days. This is too small for a reliable A/B test or a causal churn conclusion.

Within seven days of trial start:

- 4/5 completed at least one transcription.
- 4/5 imported a transcription into the editor.
- 0/5 recorded at least five active editor minutes.
- 0/5 recorded a practice-mode start.
- 1/5 was active on a second day.
- Average recorded editor active time was 81 seconds.

Current PostHog person properties classify three as Free, one as Premium, and one as unknown. These properties can be stale, so Stripe remains authoritative for billing state.

Interpretation: starting and completing a transcription is not the main observed bottleneck. The larger measurable gap is reaching repeatable value after import and returning on another day. Editor telemetry was introduced recently, so older missing editor events must not be treated as proof that no editing happened.

This direction is consistent with Amplitude's finding that seven-day activation and three-month retention are strongly correlated, while still being only correlational evidence rather than a promised uplift for Note2Tabs ([Amplitude Product Benchmark Report](https://info.amplitude.com/rs/138-CDN-550/images/the-product-benchmark-report.pdf)). Published SaaS conversion rates vary by an order of magnitude, so a generic benchmark is not a sound target for a five-customer B2C cohort ([ChartMogul/ProductLed Conversion Report](https://chartmogul.com/reports/saas-conversion-report/)).

## Change implemented on this branch

The Stripe webhook now records the subscription lifecycle required to diagnose churn:

- `subscription_cancel_scheduled`
- `subscription_cancellation_reversed`
- `subscription_trial_ending`
- `subscription_renewed`
- `subscription_payment_failed`
- `subscription_ended`

Events use the authenticated Note2Tabs user ID, contain no email or Stripe customer identifier, and use Stripe event IDs for idempotency. Cancellation reason and feedback are recorded when Stripe supplies them.

The browser's checkout confirmation is recorded separately as
`subscription_checkout_confirmed`. Only the verified Stripe webhook emits
`subscription_started`, preventing a successful checkout return and its
webhook from inflating the trial cohort.

Successful checkout now continues into `/home` instead of leaving the customer in Settings. A trial-only activation card shows the real trial/cancellation state and links the latest tab directly into Practice. The CTA and landing are measured separately so we can observe whether this creates editor/practice use and a later return.

When custom trial messaging is enabled, the initial enrollment notice includes the seven-day duration, start and first charge date, $5.99 monthly price, included service, and direct online cancellation. This is required because Visa's current public rules require the amount, transaction date, and easy online cancellation at least seven days before the recurring charge ([Visa Core Rules, pp. 460–461](https://corporate.visa.com/content/dam/VCOM/download/about-visa/visa-rules-public.pdf)); Stripe separately notes that for a trial seven days or shorter, those details belong in the initial confirmation ([Stripe trial requirements](https://docs.stripe.com/billing/subscriptions/trials)). The later three-day message is activation support, not the sole billing notice.

## Stripe settings that require dashboard authorization

Before adding custom lifecycle email code, verify these in the production Stripe Dashboard so customers do not receive duplicate messages:

1. Customer portal: allow cancellation at period end and enable cancellation-reason collection.
2. Choose exactly one trial reminder:
   - keep `PREMIUM_TRIAL_REMINDER_MODE=stripe` (or unset) and enable Stripe's native trial-ending reminder; or
   - set `PREMIUM_TRIAL_REMINDER_MODE=custom` and leave Stripe's reminder disabled. The custom reminder states the renewal date and price and returns the customer to their latest tab in Practice mode.
3. Revenue recovery: enable Smart Retries and failed-payment emails.
4. Branding: confirm Note2Tabs logo, colours, support URL, and statement descriptor.

Stripe documents `customer.subscription.trial_will_end` as arriving about three days before trial end and recommends trial-ending notices. Stripe also recommends Smart Retries and payment-update emails for recoverable payment failures.

### Current test-mode audit

The Stripe account available to this workspace was inspected read-only on August 29, 2026. It is a **test-mode** account, so these findings must not be presented as the production configuration:

- There is no active Customer Portal configuration. Preview testing cannot currently prove self-service cancellation, cancellation reversal, payment-method updates, or cancellation-reason capture.
- The only test webhook endpoint is disabled.
- That endpoint includes subscription updates/deletion, trial ending, payment failure, and invoice payment, but does not subscribe to `checkout.session.completed`.

Before end-to-end preview verification, create or activate a test Customer Portal configuration with payment-method updates, subscription cancellation at period end, and cancellation reasons; then enable a test webhook endpoint covering `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.payment_failed`, and `invoice.paid`. Repeat the same audit separately against live mode before production rollout.

Cancellation reasons should include price, missing features, alternative, no longer needed, service, ease of use, quality, and free text—the categories Stripe supports in its portal ([Stripe cancellation page](https://docs.stripe.com/customer-management/cancellation-page)). Do not enable a retention coupon until cancellation reasons show price is a material cause and retained revenue can be measured; otherwise it can train customers to cancel for a discount.

Stripe recommends Smart Retries and currently describes eight attempts over two weeks as its default recommendation; hard declines still require a new payment method ([Stripe Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)).

## Full lifecycle audit

1. **Acquisition promise:** Premium value claims match current credits, upload length, and Heavy-model access. Do not claim faster processing without verified priority scheduling.
2. **Checkout intent:** Source, reason, model, device, offer, and funnel ID are carried into Stripe. Success returns to product activation; preserved large uploads retain their dedicated resume path.
3. **Enrollment disclosure:** Stripe Checkout collects payment; custom mode sends an immediate, idempotent terms notice. Exactly one native/custom reminder system must be selected.
4. **First value:** Most observed trial users completed and imported a transcription. This is not the primary measured bottleneck.
5. **Durable value:** Latest-tab Practice is now the trial-home continuation path. Measure practice, editor active time, and next-day return—not pageviews alone.
6. **Quality failure:** Segment cancellation by transcription success/model/audio type and Stripe's quality/ease reasons. Do not infer bad transcription from cancellation alone.
7. **Trial ending:** Show accurate time and cancellation state in-product. Provide direct online management; never hide cancellation.
8. **Voluntary cancellation:** Capture schedule, reason, feedback, reversal, and final end. Keep access through the paid/trial period while Stripe status remains entitled.
9. **Involuntary churn:** Capture payment failures and successful renewals; configure Smart Retries and payment-update emails in Stripe.
10. **Experimentation:** With five users, one person moves the rate by 20 percentage points. Accumulate a stable baseline before feature-flagged tests; compare activation and renewal cohorts, not clicks.

## Next retention work after lifecycle data is live

Do not run an A/B test yet. Accumulate at least enough trial starts and conversions to estimate a baseline without one customer changing the result materially.

Prioritize:

1. A first-session activation path from successful transcription to opening the imported tab, hearing playback, and trying practice mode.
2. A return path that takes the user directly back to their most recent tab.
3. Segmentation by Heavy/Light, audio type, transcription success, import, editor active time, practice, return day, cancellation reason, and payment failure.
4. Qualitative follow-up with cancellers who have consented to product communication; do not infer a product defect from cancellation alone.

Release success should be measured as trial users who both reach an activation milestone and return on another day, followed by trial-to-paid conversion and first renewal. Checkout clicks alone are not a retention outcome.
