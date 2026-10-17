# Engagement policy experiment v1

Implementation date: 2026-10-17. Not launched, deployed, or merged.

[PostHog draft 101886](https://eu.posthog.com/project/208789/experiments/101886), flag `engagement-policy-v1` (317923), currently inactive.

## Assignment and comparison

Three account-level groups share one assignment across reminders, campaigns, sessions and devices:

| Group | Allocation | Policy |
| --- | --- | --- |
| control | 34% | No optional reminder emails or Premium prompts |
| existing | 33% | Existing copy, triggers and timings, with common permission/safety checks and contact cap |
| contextual | 33% | Value/context-driven reminders and Premium prompts |

A deterministic account hash is persisted before any intervention. PostHog uses the custom `engagement_policy_assigned` exposure, original enrollment timestamp and stable event UUID; exposure delivery is awaited. The native flag is a launch/stop gate, not a second assignment. There are no nested campaign or timing experiments. Existing campaign holdouts are bypassed while this experiment is enabled.

The primary comparison is contextual versus existing (the configured baseline). Comparisons with control are secondary. This tests the combined engagement policy: it cannot identify the independent contribution of email versus CTA, localization versus selection, or individual score components. Analyze all assigned accounts, including no-action decisions; do not compare only recipients or people who saw a prompt. Later eligibility can itself be affected by treatment.

## Context and frozen rules

Snapshots use up to 30 days of observed successes, repeat transcription, playback/practice, edits, saved work, imports, exports, pricing activity, actual limits, checkout, unresolved failures, previous contacts and dismissals. Incomplete snapshots fail closed. Imports/exports are tracked as actual application outcomes, with transfer IDs for deduplication; a browser download initiation cannot prove the user saved or used the file.

The contextual CTA score is capped binary evidence: practice 4, export 4, import 2, pricing 2, at least two successes 2, edit 1, save 1. Threshold is 6; a genuine recorded limit can also qualify after demonstrated value. Historical weight exploration informed some choices, but import/export weights remain explicit unvalidated hypotheses. This is not an estimated probability of returning or incremental response to a reminder.

Hard gates override scores: free account, complete data, safe moment, demonstrated value, no active checkout or unresolved failure, no recent dismissal/contact. Contextual email content follows the demonstrated value type (practice, export, import, editing or another transcription), with inactivity and accessible-work checks. Signup/analytics consent is never treated as reminder-email permission.

One contextual CTA timing only: **1,200 ms after playback stops or finishes**, at a visible, non-editing pause. Further interaction, playback restart, navigation or backgrounding cancels the pending opportunity. This is not proof of listening to a whole track. All variants record the playback event identically. Optional promotional failures do not block the editor.

Common cap: one reserved contact opportunity per account **per channel per rolling seven days**, across campaigns and devices. Reservations (including cancelled, failed or uncertain deliveries) count toward the cap; the experiment prioritizes avoiding duplicates over maximizing impressions. Email and CTA are separate channels. Classic reminder markers remain a shared safeguard: saved-tab emails also retain the existing fourteen-day account cooldown and once-per-tab marker, across both contacted arms and after switching the experiment off. Existing-policy behavior is therefore the existing policy under these common safeguards, not a byte-for-byte historical baseline.

Actual limit explanations, functional upgrade requirements, pricing links and user-requested checkout remain available in every arm. No coupons or free credits are issued.

## Measurement and stopping

Native primary: editor return (`gte_session_started`) during days 1–7 after first exposure. This is an editor-return proxy, not the broader historical union of meaningful actions. Secondary metrics: transcription return in days 1–7; tracked `subscription_started` within 14 days; reminder unsubscribe within 14 days (decrease desired). Subscription analytics coverage must be reconciled with billing before claiming revenue uplift.

PostHog settings verified: existing baseline, completed conversion/retention windows required, first-seen handling for multiple variants. Current project Bayesian setting is 95%. Do not select a winner from daily fluctuations or an immature cohort. Monitor assignment proportions (34/33/33), crossover, missing exposures, delivery failures, prompt errors, unsubscribes and complaints. Operational regressions can stop the experiment immediately.

Plan for at least two full weeks of enrollment plus mature follow-up, and an adequate sample before a performance decision. Illustratively, a two-sided 5% frequentist test with 80% power needs about 1,060 people per arm to distinguish a 5% return rate from 8%; this is a rough planning calculation, not a power guarantee for PostHog's Bayesian analysis, multiple comparisons or the actual audience. Low-volume paid conversions are secondary and may remain inconclusive for substantially longer. Freeze weights and timing during this version; a material change needs a new version.

## Launch requirements still outstanding

- Apply both engagement migrations in production through the normal release workflow, and deploy reviewed code. Neither has been done here.
- Enable collection and confirm incoming import/export/playback events, identity linkage and outcomes before treatment; collect a sufficient observation window for contextual decisions. Audit older contact/cooldown history so an existing reminder is not immediately followed by an experimental one.
- Establish a permission-backed reminder audience with provenance in `EngagementEmailPermission`. The table defaults to no permission; no existing account was automatically opted in. The account privacy-settings opt-in/revocation workflow and signed unsubscribe path are now implemented and tested, with provenance and default denial. Confirm them in the deployed environment before launching emails. Delivery reconciliation remains an operational launch check.
- Validate scheduler candidate coverage and production email delivery/unsubscribe end to end using controlled accounts; unit tests do not prove deliverability.
- Review contextual reminder translations with native speakers before sending. All ten supported locales have copy and structural tests; that does not establish perfect idiomatic quality.
- Completed synthetic Chrome checks on desktop and mobile, including Arabic RTL. See `readiness-tests-2026-10-17.md` for the division between browser fixtures and real PostgreSQL/API checks.
- Enable `ENGAGEMENT_SIGNALS_ENABLED`, `ENGAGEMENT_EXPERIMENT_ENABLED` and `NEXT_PUBLIC_ENGAGEMENT_EXPERIMENT_ENABLED` only as part of a coordinated launch; `ENGAGEMENT_REMINDERS_ENABLED` additionally gates reminders. Defaults remain false. Start the native experiment only after readiness checks, so enrollment begins at the intended start.

Tests cover stable assignment/distribution, stored assignments, control suppression, cross-campaign contact locking, entitlement/consent authorization, contextual checkpoint gating, hard safety gates, localized reminder structure, and existing ingestion/export/reminder behavior. No production data mutation, actual reminder delivery or live CTA experiment was executed.

## Readiness follow-up

The implementation and test results were updated on 17 October. See [readiness tests](readiness-tests-2026-10-17.md). Production flags remain disabled; a merge is distinct from native experiment activation and email launch.
