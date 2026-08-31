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

The in-product intent prompt emits:

- `retention_intent_prompt_shown`
- `retention_intent_selected`
- `retention_intent_prompt_dismissed`

## Analyses that activate after deployment

Two dashboard tiles should only be created after their source events have arrived in production:

1. Intent → activation → D7/D14 retention, broken down by `intent` and `prompt_version`.
2. Inactive-signup randomized assignment → first transcription → D7/D14 retention, broken down by `timing_variant`, including the holdout.

Creating these before the events exist would produce an apparently valid but empty report. Their event producers already exist; verify the first events, then add the tiles.

## Decision rules

- Do not draw model conclusions from groups with fewer than 30 users.
- Do not change model defaults based on the unadjusted Heavy versus Light total.
- Treat reminder timing as causal only when assignment balance and the holdout are present.
- Prefer activation and retained-user rates over opens; email opens are unreliable.
- Review results after at least one complete D14 observation window.
