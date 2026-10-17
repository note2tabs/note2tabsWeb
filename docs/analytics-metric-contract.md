# Analytics metric contract

Audited 2026-10-17. PostHog project 208789, UTC.

## Dashboard definitions

- Users: daily sign-ups use production User.created_at, via a warehouse snapshot which can lag six hours. Registered accounts are not active users. The PREMIUM-role snapshot excludes Pro and administrator roles and is not collected revenue.
- Daily lifecycle uses tracked pageviews and person profiles. New means profile first seen in the interval; returning means active in both consecutive intervals; resurrecting means active after at least one inactive interval; dormant means active in the preceding interval but not this one. Anonymous events without person profiles are excluded. Dormant is not permanent churn. Today is incomplete.
- Independent stage-reach counts are not funnels. Checkout conversion uses an ordered seven-day funnel; recent entrants have incomplete follow-up. Flow-ID tables count flows, not people.
- subscription_started means subscription activation, including trials, not collected revenue. Use Stripe for collected revenue. Never add different currencies without conversion.
- Return-within-seven-days measures activity on any UTC calendar day 1–7 after signup/first-observed day, not exact-day-seven retention. Background transcription completions do not count as a return. Only mature cohorts belong in comparisons; first-observed cohorts need not be new accounts. Activity correlations do not establish causal effects.
- Editor time uses activeDurationSec (visible foreground time), not durationSec (wall-clock time). Visibility does not prove attention, and hard browser closes can lose session ends.
- Exports use gte_export_download_initiated, which records initiation, not confirmed disk persistence. Current export/import tracking has limited history; missing older events cannot be backfilled as zero usage.
- Job outcome charts use server_job_outbox and unique job IDs. Submission/browser errors are a separate stage. Outcomes by completion day are not a start-cohort success rate. Server-confirmed coverage begins in October 2026.
- Web Vitals percentiles use measured samples only; absent metrics are null, not zero. LCP/INP are milliseconds; CLS is unitless.
- Scheduler freshness uses two hours for the hourly inactive-signup scheduler and 26 hours for the daily tab-return scheduler. Alert configuration was preserved.
- Envelope coverage describes the server-proxy contract only, not the validity of all SDK or Stripe events.

## Delivery and identity

Known preview/development/test events are excluded from product charts; historical events without environment fields remain for continuity. Operational error monitoring retains its broader scope. Consent, blockers, network loss, identity merging and warehouse lag mean analytics are observations rather than an exact census.

Billing webhook events use stable UUIDs and the signed Stripe event creation time through the timestamp-preserving transport. Server-only business captures now persist to a delivery outbox and retry through the analytics scheduler; earlier SDK-generated duplicate timestamps are not rewritten. Editor telemetry assigns event IDs before sending, preserves timestamps across bounded in-memory retries, falls back when sendBeacon rejects a batch, retries network/429/5xx failures and clears pending retries after opt-out. Accepted beacons do not provide delivery acknowledgements; browser shutdown can still lose events.

## Maintenance

Keep one canonical chart per definition and reuse it. Describe numerator, denominator, interval, data source, exclusions and incomplete follow-up. Force-refresh and inspect results after changes; a rendered chart alone does not prove the definition is correct. Do not use stopped warehouse imports for operational charts. Do not change experiment outcome definitions mid-run as part of cosmetic dashboard cleanup.

The audit reduced 14 dashboards/89 saved insights to eight dashboards/56 retained insights, including the restored lifecycle chart. Removed reports were soft-deleted; captured event history and active alerts were preserved. Private original configurations and rollback records are stored locally, outside this public repository.

Account creation now owns signup_completed for both email and OAuth. Browser success-screen events are not an independent signup source. See [tracking verification](analytics-tracking-verification-20261017.md) for the counting contracts, tests and delivery boundaries.
