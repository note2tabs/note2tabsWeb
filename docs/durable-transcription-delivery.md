# Durable transcription delivery

The five-minute transcription scheduler now saves completed root jobs independently of browser polling and analytics permission. It uses the same result serializer/upsert and ownership checks as the job-status route. Review-ready results use the existing finalize endpoint, never another prediction or credit deduction. Account-language completion emails retain their existing once-only guard; recovery does not email results older than 24 hours.

A three-minute per-job lease prevents overlapping scheduler runs. Failures remain pending with a five-minute retry delay and emit the sanitized operational event `transcription_result_delivery_failed`, covered by the existing hourly PostHog alert. New unattempted jobs take precedence over previously failed jobs. The batch is bounded to five roots and stops starting work after two minutes. The function limit and Cloud Scheduler request deadline are 300 seconds. Empty/failed/non-final results are not acknowledged as delivered. Successful root jobs without an owned TabJob are excluded from routine pruning, including analytics opt-outs.

All existing job-status helpers were moved unchanged to `lib/jobResultDelivery.ts` so the browser route and scheduled delivery share persistence behavior. This move accounts for most changed lines.

Multi-chunk imports defer the job-to-editor link until all tracks, timing and post-import work succeed. The final link endpoint checks both result ownership and backend editor access. Existing clients retain the prior protocol until refreshed. A failure can leave a partial editor visible in the library, but it no longer makes new clients treat that partial import as a completed result; the durable transcription remains available to retry.

Validation: 86 targeted tests; TypeScript; production webpack build. Regression coverage includes closed-browser delivery, review-ready finalization, failed storage/email retries, lease contention, old-email backlog suppression, prune protection, partial chunk failure and cross-account editor-link rejection. No customer audio was used. A clearly labelled synthetic backend workflow was created on the operator's own account for production verification.

The separately merged backend fix moves synchronous finalization off the ASGI event loop; a blocking-compilation test verifies the worker heartbeat stays responsive. GPU Light rollout measurements are recorded separately from these delivery changes.
