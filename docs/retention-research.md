# Retention research

This work deliberately separates association from causation and does not add another email campaign.

## Live dashboard

PostHog: `https://eu.posthog.com/project/208789/dashboard/926079`

The dashboard currently includes:

- D7 retention by first-day activity.
- D7 retention by acquisition source and activation.
- D7 retention by transcription model, duration bucket, and input source.
- D7 retention by first transcription outcome.
- Weekly signup-cohort D1, D7, and D14 retention.

The model report is observational. It must not be used to claim that Heavy causes retention. The randomized inactive-signup reminder assignment is the causal test for whether prompting activation changes later return behavior.

## Canonical definitions

- **Activation:** within one day of signup, a successful transcription, editor import, editor session, practice start, or save.
- **D1 return:** a meaningful product event on the next calendar day.
- **D7 return:** a meaningful product event on a later calendar day within seven days of the cohort event.
- **D14 return:** the same definition within fourteen days.
- **Meaningful product event:** transcription start/success, import, editor session, practice, save, or signed-in home return.

All reports exclude users whose observation window has not yet elapsed. Small acquisition groups are hidden until they have at least three signups.

## Instrumentation added by this branch

Every transcription start, queue, immediate success, and immediate failure now carries the same research dimensions:

- `research_version`
- `transcriptionModel`
- `input_source`
- `duration_sec`
- `file_size_bytes`
- `separate_guitar`
- `multiple_guitars`
- `appending_to_existing_editor`

The job completion event carries the available model, duration, source mode, separation, and multi-guitar properties. This permits comparable cohorts instead of mixing materially different recordings.

Tab-return reminder landings emit `tab_return_reminder_landed`. Processed treatment and holdout assignments are excluded before the hourly batch limit, preventing old assignments from starving newer eligible users.

Both hourly reminder endpoints emit `reminder_scheduler_run_completed`; reaching the batch limit also emits `reminder_scheduler_backlog_detected`, and an uncaught run error emits `reminder_scheduler_failed`. Zero eligible users is a healthy completed run. Individual send failures emit `reminder_email_delivery_failed`. AWS SES delivery, bounce, and complaint notifications are accepted at `/api/email/ses-events` and emit their corresponding lifecycle events for tagged reminder messages.

PostHog monitors should alert on any `reminder_scheduler_failed`, `reminder_scheduler_backlog_detected`, `reminder_email_delivery_failed`, or `reminder_email_complaint_received` event. Bounces are tracked for deliverability analysis but an individual bounce is not an operational alert. A heartbeat monitor should alert when either scheduler has no `reminder_scheduler_run_completed` event for two hours. The SES webhook requires `SES_EVENT_WEBHOOK_SECRET` and an SNS HTTPS subscription to `https://www.note2tabs.com/api/email/ses-events?secret=...`.

Browser `$exception` events include `alert_eligible`. Operational alerts must filter for `alert_eligible = true`. Expected validation and user states—including oversized files, missing/invalid fret input, authentication, quotas, rate limits, cancellations, offline/network failures, and ResizeObserver noise—remain available for product analysis but are explicitly ineligible for alerts.

Every reminder includes a signed preference link. Confirming it emits `reminder_email_unsubscribed` and permanently suppresses both reminder categories while leaving essential account and billing mail enabled. Configure `EMAIL_UNSUBSCRIBE_SECRET`; `CRON_SECRET` is accepted as a backwards-compatible fallback.

The in-product intent prompt emits:

- `retention_intent_prompt_shown`
- `retention_intent_selected`
- `retention_intent_prompt_dismissed`

## Analyses that activate after deployment

Two dashboard tiles should only be created after their source events have arrived in production:

1. Intent → activation → D7/D14 retention, broken down by `intent` and `prompt_version`.
2. Inactive-signup randomized assignment → first transcription → D7/D14 retention, broken down by `timing_variant`, including the holdout.

Creating these before the events exist would produce an apparently valid but empty report. Their event producers already exist; verify the first events, then add the tiles.

## Suggestions intentionally deferred until results

- Choose the winning inactive-signup reminder timing from the randomized 6h/24h/72h/holdout cohorts.
- Increase, reduce, or stop the tab-return reminder rollout based on landing, meaningful return, and unsubscribe/complaint signals.
- Personalize onboarding or lifecycle messaging by stated intent only after each intent has enough activation and retention observations.
- Change model positioning or defaults only after adjusted Heavy/Light cohorts are large enough; the current comparison is observational.
- Prioritize acquisition sources using retained-user outcomes after the smaller source cohorts mature.
- Run qualitative follow-up only with appropriately contactable users and after behavioral segments identify a focused question.

Editor activation-path changes remain outside this branch because that work has been handed to the editor redesign owner.

## Decision rules

- Do not draw model conclusions from groups with fewer than 30 users.
- Do not change model defaults based on the unadjusted Heavy versus Light total.
- Treat reminder timing as causal only when assignment balance and the holdout are present.
- Prefer activation and retained-user rates over opens; email opens are unreliable.
- Review results after at least one complete D14 observation window.
