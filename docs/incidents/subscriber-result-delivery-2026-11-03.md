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

## Follow-up: import-size defect reproduced

The first pass tested saved-result readiness with mocked editor transport, which missed the failure. A deeper pass reconstructed the import request from the customer's largest stored track (5,334 segments):1,363,713 bytes, because the transport includes the segments in both `segmentGroups` and `tracks`. Existing client chunking does not divide a single large instrument track. Both editor API proxies inherited Next.js's default1MB parser limit.

Using the actual import client and Next.js's actual request parser reproduces413 before the proxy handler/backend runs. The same stored-track data is rejected at1MB and accepted at4MB. There is no captured historical413 response from this visitor, so this is a reproduced defect matching his data and symptoms, not proof of every detail of his original browser failure. No editor was linked to the Heavy result.

Both saved and guest editor proxies now explicitly allow a bounded4MB JSON body, below Vercel's4.5MB ceiling. Regression tests preserve the complete long track and verify requests above4MB remain rejected. This fixes the reproduced payload-size case; still-larger tracks remain subject to the explicit4MB limit and are not claimed to be universally supported.

## Slow Light inference and502 review

-Worker instance began startup at15:47:58, was serving at15:48:09, and started preparation at15:48:10. Prediction began15:48:29. Initial model loading finished15:48:42.
-The model split383seconds into77five-second chunks. Its own generation log reports1,811.69seconds; inference-stage elapsed time was1,871.962seconds. This is primarily sequential model generation on the CPU, not32minutes of queueing or a crashed/retried worker. Peak container memory was approximately1,770MiB, below the4GiB limit.
-The subscribed Light service uses one CPU core and one PyTorch/OMP/MKL thread. Heavy uses a GPU. The source repository's earlier dense-audio CPU benchmarks already showed3.038–4.369seconds of processing per audio second. The customer's run was slower still (~4.9x audio duration for prediction), consistent with an expensive content-dependent CPU generation path. This does not establish CPU contention or a new infrastructure regression.
-An earlier two-CPU dense benchmark was slower than one CPU (102.538s vs91.131s for30s audio). Simply buying more CPU is not a demonstrated fix. A separate controlled inference optimization/GPU benchmark is needed before changing production costs or routing. No paid inference was repeated during investigation.
-The API service's logs around15:56:00–15:57:10 show other requests returning200 normally, with roughly1.2s status-query latencies. No corresponding request to this customer's job or API crash/5xx was found in that window. The frontend status proxy returns502 when its upstream fetch/body read throws. Available evidence points toward a transient Vercel→API transport failure, but the exact exception was discarded by the existing catch and cannot be recovered from these logs. Do not call the underlying network cause fixed.

No infrastructure configuration was changed. No customer editor was created or modified. Stored tabs remain intact.

## Validation

- 61 targeted tests passed across job delivery, polling, backend proxy coordination, finalization, import chunking, saved/guest request parsing and proxy analytics.
- New rendered-page cases cover502→completion→editor, initial network failure, real worker failure,401/403/404, stored-result import, preparation-failure telemetry and no duplicate import-failure events.
- The broader credit suite has12 failures on unchanged main as well as this branch (19 passes in that suite). The same failures were reproduced in the separate unchanged-main worktree. Credit accounting code was not changed.
- TypeScript passed; production webpack build result recorded in the PR.

No credits, Stripe subscriptions, payments, customer content or email delivery were changed. Read-only database/provider-log inspection only. Temporary customer-result fixture removed after the readiness check.

Reference for the framework request limit: https://nextjs.org/docs/15/pages/building-your-application/routing/api-routes . Installed Next16.2.12 also defaults to1mb in api-resolver.

Local production-server HTTP smoke check (using a dummy local auth secret, no customer credentials): a1.36MB saved-editor request reaches authentication and returns401 rather than being rejected by the parser. Requests above4MB return413 on both saved and guest routes. Server stopped afterward. Production webpack build passed after these route changes.
