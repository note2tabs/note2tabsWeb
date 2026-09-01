# Retention work handoff — 2026-09-01

## Current production state

- Production `main` is commit `43e1451` (`Release retention monitoring without AWS integration`).
- The AWS-independent retention implementation is live and has passed 119 test files, 518 tests, TypeScript, a production build, and public production smoke tests.
- The retention research prompt is disabled by default. It cannot interrupt a user unless `NEXT_PUBLIC_RETENTION_INTENT_RESEARCH_ENABLED` is explicitly enabled in a future deployment.
- Reminder eligibility is rechecked immediately before sending, so a user who becomes active after candidate selection should not receive a stale reminder.
- Users can unsubscribe from retention reminders. The unsubscribe page and protected API were verified in production.
- Expected user mistakes are excluded from actionable error alerts. The monitoring alert is intended for unintended application, scheduler, backlog, and email-send failures.

## Email experiments

### Inactive-signup reminder

- Audience: registered users who have neither transcribed nor created an editor.
- The experiment supports deterministic timing variants at 6, 24, and 72 hours plus a holdout group.
- Candidate selection excludes activated users, users already processed, and users who unsubscribed.
- The hourly Google Cloud Scheduler job is enabled:
  - Job: `inactive-signup-reminder-hourly`
  - Region: `europe-west1`
  - Schedule: `0 * * * *` UTC
  - Endpoint: `/api/cron/inactive-signup-reminder`
  - Authentication: Google OIDC service account
- Production evidence on 2026-09-01:
  - Google Cloud reported successful hourly attempts.
  - One inactive-signup reminder was accepted for sending.
  - No scheduler or immediate delivery failures were recorded.
  - PostHog scheduler heartbeat events were incomplete even when Google Cloud reported successful attempts. The current background PostHog flush is therefore not sufficiently reliable for heartbeat monitoring.

### Return-to-tab reminder

- Audience: verified users with meaningful tab content, at least two revisions, and no recent activity.
- Eligibility requires actual `lane_notes`; empty or initial drafts should not qualify.
- It has deterministic rollout/holdout assignment, per-tab send markers, a user cooldown, and a final activity check immediately before sending.
- The intended initial rollout is limited rather than emailing every eligible user.
- Production currently schedules this endpoint through Vercel once daily at 20:30 UTC:
  - Endpoint: `/api/cron/tab-return-reminder`
  - Schedule: `30 20 * * *`
- No production tab-return send had occurred during the verification window on 2026-09-01. Do not interpret this as a successful delivery test.

## PostHog monitoring

- Dashboard ID: `926079`.
- Actionable issues insight ID: `5726430` (`YIsrN83Y`).
- Active alert ID: `01a05a46-45dc-0000-b434-650a577abe36`.
- The alert is enabled and checks hourly for:
  - `$exception` events with `alert_eligible = true`
  - `reminder_scheduler_failed`
  - `reminder_scheduler_backlog_detected`
  - `reminder_email_delivery_failed`
- AWS-only complaint events were removed from the live alert because that integration is not on `main`.
- A separate scheduler-heartbeat alert exists but should remain disabled until heartbeat capture is made reliable and real production heartbeats are consistently present.

## What is deliberately not on `main`

- SES delivery, bounce, and complaint webhook handling.
- Confirmed mailbox-delivery tracking.
- AWS SNS/SES notification configuration and its integration tests.
- These AWS-dependent changes remain represented on `origin/dev` at `afb531f` and must not be merged wholesale into `main` later. Extract and review only the AWS-specific commits/files after AWS access is restored.
- `SES_EVENT_WEBHOOK_SECRET` may still exist as an inert environment variable, but production has no `/api/email/ses-events` route; the route correctly returns 404.

## Important interpretation of email data

- `*_reminder_sent` currently means the application/email provider accepted the send request. It does not prove inbox delivery.
- Without SES events, Note2Tabs cannot reliably measure delivery, bounces, complaints, or provider-level rejection after acceptance.
- No recorded failure is not equivalent to confirmed delivery.
- Opens are privacy-sensitive and unreliable. Judge effectiveness primarily through clicks and meaningful product return, with delivery/bounce data used for operational health once available.

## Research decisions and hypotheses

- Do not email every inactive user by default. Use limited rollout and a holdout so incremental impact can be measured.
- Test reminder timing as well as whether reminders work at all.
- Stop reminders immediately when users activate or return.
- A tasteful return-to-work reminder should point to a real tab or a clear next action; it should not shame users or interrupt an active workflow.
- The in-product research prompt was disabled because it could disrupt users. If research resumes, favor low-friction, optional collection at a natural pause or through carefully targeted outreach.
- Earlier retention analysis suggested retained users often show more meaningful first-day use. This is correlation, not proof that forcing more first-day actions causes retention.
- Heavy-model usage may correlate with retention through better results, but selection bias is plausible. Compare like-for-like cohorts before changing defaults or making causal claims.

## Branch map

- `origin/main` / `origin/codex/retention-prod-no-aws-20260901` at `43e1451`: finished AWS-independent production work.
- `origin/dev` at `afb531f`: contains deferred AWS-related work and must not be merged directly.
- `origin/codex/retention-research` at `983e149`: historical research/monitoring integration branch; superseded for production by `43e1451` but useful for archaeology.
- `origin/codex/tab-return-retention-email` at `11c54c7`: historical reminder branch; its completed AWS-independent changes are already represented by the production release.
- `codex/retention-handoff-20260901`: this handoff only; use it to recover context without modifying production.

## Next steps when retention work resumes

1. Restore AWS access and configure SES/SNS delivery, bounce, and complaint notifications against a preview/staging route first.
2. Reintroduce only the reviewed AWS-specific implementation; do not merge all of `dev` into `main`.
3. Replace fire-and-forget PostHog heartbeat flushing with an awaited/reliable capture path, then verify consecutive hourly heartbeats.
4. Enable the heartbeat alert only after both schedulers produce reliable production events.
5. Verify a real tab-return email end to end before increasing rollout.
6. Track the experiment funnel: assigned → accepted for send → delivered → clicked → meaningful return, with holdout comparisons.
7. Review results only after adequate samples. Do not optimize timing or content from one or two sends.
8. Keep editor redesign work separate; another engineer owns editor-related retention changes.

## Definition of meaningful return

Do not count only a page open. Prefer outcomes such as returning on another day and then editing, saving, practicing, exporting, importing, or completing another transcription. Report D1, D7, and D14 return behavior alongside editor return behavior and second-transcription rate.
