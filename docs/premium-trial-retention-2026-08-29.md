# Premium trial retention audit — 2026-08-29

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

## Change implemented on this branch

The Stripe webhook now records the subscription lifecycle required to diagnose churn:

- `subscription_cancel_scheduled`
- `subscription_cancellation_reversed`
- `subscription_trial_ending`
- `subscription_renewed`
- `subscription_payment_failed`
- `subscription_ended`

Events use the authenticated Note2Tabs user ID, contain no email or Stripe customer identifier, and use Stripe event IDs for idempotency. Cancellation reason and feedback are recorded when Stripe supplies them.

## Stripe settings that require dashboard authorization

Before adding custom lifecycle email code, verify these in the production Stripe Dashboard so customers do not receive duplicate messages:

1. Customer portal: allow cancellation at period end and enable cancellation-reason collection.
2. Subscriptions and emails: enable the trial-ending reminder and point its management link to the customer portal.
3. Revenue recovery: enable Smart Retries and failed-payment emails.
4. Branding: confirm Note2Tabs logo, colours, support URL, and statement descriptor.

Stripe documents `customer.subscription.trial_will_end` as arriving about three days before trial end and recommends trial-ending notices. Stripe also recommends Smart Retries and payment-update emails for recoverable payment failures.

## Next retention work after lifecycle data is live

Do not run an A/B test yet. Accumulate at least enough trial starts and conversions to estimate a baseline without one customer changing the result materially.

Prioritize:

1. A first-session activation path from successful transcription to opening the imported tab, hearing playback, and trying practice mode.
2. A return path that takes the user directly back to their most recent tab.
3. Segmentation by Heavy/Light, audio type, transcription success, import, editor active time, practice, return day, cancellation reason, and payment failure.
4. Qualitative follow-up with cancellers who have consented to product communication; do not infer a product defect from cancellation alone.

Release success should be measured as trial users who both reach an activation milestone and return on another day, followed by trial-to-paid conversion and first renewal. Checkout clicks alone are not a retention outcome.
