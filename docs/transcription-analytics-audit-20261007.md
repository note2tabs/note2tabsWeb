# Transcription analytics audit — 7 October 2026

The MuScriptor services are deployed. This follow-up fixes lifecycle analytics and preserves historical model identities. It changes the frontend/API repository only; inference services and their builds are unaffected.

## Findings

The live one-day audit found 48 editor-import events without a canonical job ID, 64 browser-observed completion events, and no worker-pool properties on those lifecycle events. Canonical parsing ignored IDs nested inside event properties. Browser delivery ignored failed HTTP responses and detached server flushes could stop after the Vercel response. Browser completion used newly generated event IDs on each mount, despite supplying an unused `$insert_id`.

Preview starts appeared in the model usage chart. The saved retention SQL also failed when run against the current schema. Both were corrected without rewriting historical events.

## Current contract

- `transcription_started` and the implementation-specific start event are recorded from accepted root-job metadata.
- `job_completed`, `transcription_succeeded`, `transcription_failed`, and `heavy_preview_completed` come from persisted terminal job states. A requeued attempt does not count as a final failure.
- `transcription_result_viewed` records the browser observing a result. Server-tracked jobs do not emit another browser completion.
- Editor import has start, success, and failure events, correlated by canonical `job_id` and `editor_id`, with import elapsed time. An unavailable import result records a failure instead of leaving an orphan start.
- Model implementation, actual worker pool, subscription plan, access type, preview status, input source, audio duration, credits, and elapsed time accompany server lifecycle events. Small pools are read from the actual prepare-job type because the backend response omits their pool name.
- `msmodel_small` is new Light; `basic_pitch` is historical Light; `msmodel` is Heavy; `yourmt3` remains historical retired Medium.
- Consent opt-out prevents registration. Acquisition classification and coarse edge geography are preserved. Datacenter IPs are not geolocated as visitors. No audio, raw source URL, filename, note output, or raw error is captured.

The root job input contains a small `transcriptionAnalytics` outbox. Delivery marks are written after confirmed PostHog flush. Retries reuse event UUID, timestamp, name, and owner. Cleanup preserves terminal jobs with pending delivery. Browser batches also retry failed HTTP delivery and fall back to keepalive fetch when beacon enqueue fails.

## Scheduling and deployment

Vercel is on Hobby, so Google Cloud Scheduler calls `https://www.note2tabs.com/api/cron/transcription-analytics` every five minutes. The job is `note2tabs-transcription-analytics` in `note2tabs-backend/europe-west1`. Its dedicated bearer secret is stored as `TRANSCRIPTION_ANALYTICS_CRON_SECRET` in Vercel production and Google Secret Manager. No warm inference instance or transcription queue is introduced. Analytics can appear several minutes after a job finishes.

Production uses the server outbox; preview deployments retain browser tracking. Saved Light comparison, model usage, and retention charts exclude preview and explicitly tagged test traffic. Query definitions are recorded in `transcription-analytics-audit-20261007.json`.

## Validation

Unit/integration coverage includes retry identities, successful and failed outcomes, Heavy previews, subscribed Small routing, HTTP retries, beacon fallback, opt-out, and scheduler authorization. TypeScript and production build checks pass.

A live tagged test created five isolated synthetic root jobs across free Small, subscribed Small, paid Heavy, Heavy preview, and final failure. The first delivery captured 20 lifecycle events; a second delivery captured zero. Fixtures are tagged `is_test=true` and excluded from the saved charts. This validates analytics delivery without charging customers or rerunning inference. Earlier production inference tests cover all four service pools; a paid browser/account workflow remains a separate check.

Local Desktop access was interrupted by macOS during this audit. The completed branch was prepared in `/tmp/note2tabs-frontend-analytics`; the original dirty working copies were preserved.
