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

Both hourly reminder endpoints emit `reminder_scheduler_run_completed`; reaching the batch limit also emits `reminder_scheduler_backlog_detected`, and an uncaught run error emits `reminder_scheduler_failed`. Zero eligible users is a healthy completed run. Individual send failures emit `reminder_email_delivery_failed`.

PostHog monitors should alert on any `reminder_scheduler_failed`, `reminder_scheduler_backlog_detected`, or `reminder_email_delivery_failed` event. A heartbeat monitor should alert when either scheduler has no `reminder_scheduler_run_completed` event for two hours.

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

## MuScriptor Light rollout (2026-10-07)

The visible tier remains Light, but analytics distinguishes its implementation.
New Light events use `model`, `transcriptionModel` and `transcription_model_id`
`msmodel_small`; historical Basic Pitch events keep `light`. New events also
include `transcription_backend_method`, `transcription_model_implementation`,
`transcription_model_display_name`, `transcription_model_tier`, and
`transcription_analytics_version=model_implementation_v2`.

- Legacy Basic Pitch: id `light`, backend `basic_pitch`, start event
  `transcription_started_light_model` (new Light requests never emit this).
- MuScriptor Small Light: id/backend `msmodel_small`, start event
  `transcription_started_msmodel_small`.
- MuScriptor Medium Heavy: id `super_heavy`, backend `msmodel`.
- Retired YourMT3 Medium: historical id `heavy`, backend `yourmt3`.

The canonical `transcription_started` event remains unchanged, with the new
implementation dimensions. Start, upload, queued, failure, completion and editor
import events share model identity where available. Completion/import reads the
stored job method first; new job links also carry `transcriptionMethod`. Old
Light links with no implementation metadata resolve to Basic Pitch. History/job
links with a recorded method need no UI model hint. Unknown jobs are not labeled
as MuScriptor by default.

Research payloads use `retention_v3` and `transcription_flow_version=original_mix_v2`,
with `instrument_questions_shown`, `audio_separation_used`, and
`track_separator_used` false. Legacy separation flags remain false for new
submissions; they no longer represent answers about the recording's contents.

Three existing live PostHog insights were updated without rewriting events:

- [Light starts: Basic Pitch vs MuScriptor Small](https://eu.posthog.com/project/208789/insights/aLU1PzqE)
- [Transcription model usage (30d)](https://eu.posthog.com/project/208789/insights/zAtcsgBK)
- [D7 retention by transcription model and recording profile](https://eu.posthog.com/project/208789/insights/bIVod06e)

Usage and retention prefer implementation metadata, then map historical ids at
query time. Start trends have separate named series and a visible legend. All
three saved queries executed successfully after update. At verification, the
30-day usage chart returned 1,867 Basic Pitch, 322 YourMT3 and 66 MuScriptor Medium
starts; MuScriptor Small had no production starts. Its new series begins only
when the prepared frontend rollout ships. D7 results require a mature window.

The before/after query definitions are saved in
`muscriptor-model-analytics-posthog.json` for review or rollback. This follows
PostHog's [event versioning guidance](https://posthog.com/docs/product-analytics/best-practices)
and uses [event-property breakdowns](https://posthog.com/docs/product-analytics/trends/breakdowns).

Validation: 88 targeted frontend analytics/API/job tests and TypeScript passed.
Backend compact-status and API-security tests also passed. The webpack
production build also passed; public trust metrics used their existing local
fallback because no database connection was supplied. Live charts are updated;
frontend/API changes remain in the isolated worktree and are not deployed.

### Heavy service pool tracking

The prepared backend split keeps both Heavy pools on MuScriptor medium and at
zero minimum instances. Accepted transcription events now include
`transcription_worker_pool` from the backend acceptance response. Completion and
import events use the root job's recorded `workerPool`, forwarded by compact job
status. Values are `paid_speed`, `preview_cost`, and `legacy_preview` while the
preview rollout flag is disabled. These indicate intended routing, not a measured
latency guarantee. Both Heavy pools retain model implementation `msmodel`;
Small and historic Basic Pitch remain distinct. No client-submitted pool field
selects the backend worker. This tracking is prepared locally and not deployed.

Pool metadata forwarding checks passed alongside model analytics tests (58 tests),
TypeScript checking, and the production webpack build. Backend tier routing,
worker isolation, preview duration checks, and trigger repair passed (59 tests
plus 19 subtests across the focused backend regression suite). The medium image
build, GPU benchmarks, and end-to-end preview queue validation remain pending.
