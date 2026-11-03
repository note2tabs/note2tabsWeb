# Subscriber result delivery — November 3, 2026

Investigated the Norwegian-billing subscriber's cancellation report that credits were charged without usable tabs. All times below are UTC (Stockholm is UTC+1).

## Observed impact

- 15:26:45: accepted a383-second Heavy upload,65 credits.
- 15:31:50: Heavy prediction completed. Backend finalization succeeded; a durable TabJob was saved at15:32:12. It contains three tab groups and four instrument tracks. No editor was linked to that result.
- 15:34:33: browser autocapture records `Retry opening editor`. This is evidence that the first opening attempt failed. No corresponding import-failure event was found; failures during preparation happened outside the existing import-operation telemetry.
- 15:47:57: accepted another383-second upload using Light,26 credits.
- 15:56:49: `/api/jobs/[id]` status request returned502 after24.4 seconds. Two seconds later the user clicked `Return to transcriber`.
- 16:00:27: cancellation scheduled.
- 16:19:48: Light prediction completed,31 m51.5 s after acceptance. Worker pipeline logs attribute31 m12 s to model inference, rather than a long queue wait. No second editor import was observed.

The account's current mirrored balance was9, matching100−65−26. This is not evidence of duplicate charging or91 credits charged for worker-reported failed jobs: both predictions eventually succeeded. It is evidence that success at the model stage did not give this customer a usable result before cancellation.

## Reproduced defect and fix

Render the real JobPage, return processing/progress50, then return502 for the next poll. Before the fix the page passes `status:error` to its status UI even though the worker has not failed. The existing polling loop actually schedules another poll in `finally`; the confirmed defect is the false failure presentation, not proof that polling stopped permanently. The customer left during that error presentation.

The regression fails before the change and passes after it. Transport failures now use a typed error with an explicit retry policy. Network/body interruptions,408,429 and5 xx preserve the last known job state; the next scheduled poll fetches fresh status without the previous ETag. Authentication/not-found4 xx responses retain the previous terminal handling. A real200 response containing a failed job still displays failure. No resubmission or credit charge is made by reconnecting.

Separately, failures before the import operation (readiness/finalize/existing-editor navigation) now emit the existing import/navigation failure event with a safe stage and category. Errors already reported inside import are not emitted twice. Raw error messages and customer file contents are not added to analytics. This improves evidence collection; it does not claim to fix the first opening failure.

## Unresolved issues

The Heavy result's saved payload passed a local readiness/import-dispatch check using the real saved data, but the actual editor transport was mocked. This does not recreate the failed phone experience. The first failure's cause remains unresolved. No customer editor was created or modified during investigation.

The slow Light inference is confirmed, but its cause is not established. The subscribed worker service currently has concurrency1 and1 vCPU/4 GiB; those settings alone do not establish why this particular inference took31 minutes. No infrastructure configuration was changed.

## Validation

- 41 targeted tests passed across job delivery, polling, import readiness, backend proxy coordination and finalization.
-New rendered-page cases cover502→completion→editor, initial network failure, real worker failure,401/403/404, stored-result import, preparation-failure telemetry and no duplicate import-failure events.
-The broader credit suite has12 failures on unchanged main as well as this branch (19 passes in that suite). The same failures were reproduced in the separate unchanged-main worktree. Credit accounting code was not changed.
-TypeScript passed; production webpack build result recorded in the PR.

No credits, Stripe subscriptions, payments, customer content or email delivery were changed. Read-only database/provider-log inspection only. Temporary customer-result fixture removed after the readiness check.
