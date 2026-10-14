# PostHog alert investigation — October 14, 2026

Project: Note2TabsAnalytics, 208789 (UTC). Read-only investigation; localhost remains stopped.

Latest 48-hour issue listing across all statuses, including internal traffic, returned one occurrence affecting one user/session: [ChunkLoadError](https://eu.posthog.com/project/208789/error-tracking/01a08138-c26d-7932-8a0b-4e893237bc13), October 14 at 14:45:13.344 UTC. The issue identity first appeared September 8; this is a recurrence, not a newly identified exception type. Last seven days: two occurrences, two users, two sessions.

The latest occurrence reports `Failed to load chunk /_next/static/chunks/1olvm4xc0lc6e.js from module 10783`, on `/zh-hans/blog/guitar-pro-alternative-online`, Chrome 142 on Android. Its only captured frame is the Turbopack runtime; no source map or request HTTP status is available. The issue's older description names a different chunk: use the newest exception payload when investigating this occurrence.

The session records a click on the blog listing at 14:44:57, the exception on the article at 14:45:13, and a pageleave attributed to the listing at 14:45:14. No subsequent events were found through 15:05. Neither a session recording nor matching replay console logs was available. This cannot establish whether a reload succeeded, the article stayed broken, or the visitor left.

At approximately 15:24 UTC, both the failed chunk URL and its Turbopack runtime returned HTTP 200 with JavaScript content type and immutable caching. The failed chunk includes the application's analytics helper. Current availability does not establish availability at the affected visitor's CDN location or time, nor distinguish connectivity, a blocker, stale deployment references, or transient CDN trouble.

Existing `lib/staleChunkRecovery.ts` recognizes this exact error family, handles route errors and browser error/rejection events, attempts one guarded reload, and reports repeated recovery failure. Its seven existing tests pass. No missing handler or reproducible application defect was established; no code patch, suppression, issue status change, deployment, or paid transcription was performed. A future occurrence needs request-level diagnostics/replay to discriminate the cause; do not hide genuine chunk errors.

Reference: [PostHog stack traces](https://posthog.com/docs/error-tracking/stack-traces).

## Added local diagnostics after the investigation

Exception capture now adds `diagnostic_version`, sanitized `diagnostic_path`, `browser_online`, `page_visibility`, `page_age_ms`, navigation type, and supported network hints. `$app_version` and synchronous native ErrorEvent source/coordinates are also present in the existing local diagnostic changes.

`failed_build_assets` contains at most five same-origin `/_next/static` JS/CSS paths parsed from the actual exception message. Queries and credentials are discarded. Each entry records whether a matching resource error was observed in the preceding 30 seconds and whether a recent matching Resource Timing entry exists. Timing metadata includes age, duration, transfer/encoded byte counts, and HTTP response status only when the browser exposes a real 100–599 value. Status 0 and missing values remain unknown; transfer size 0 is not treated as proof of an offline request. Previous old successful downloads are excluded.

The resource observer stores at most ten entries in memory, is removed on analytics opt-out, and clears its observations on opt-out. It does not intercept fetch/XHR, retry diagnostic requests, capture bodies/headers/input values, or enable replay. Resource observations enrich matching SDK exceptions instead of creating duplicate exception alerts. Capture-phase recovery listeners make the decision available before the SDK's normal error/rejection capture: `reload_started`, `retry_guard_blocked`, `storage_unavailable`, or `storage_write_failed`. The existing recovery-failed custom event also receives browser diagnostics. A started reload is not labelled a successful recovery.

Coverage includes the exact new alert payload, HTTP 404 timings, unsupported/zero status, stale timings, private/external URLs, unrelated resource failures, expiry, opt-out clearing, SDK integration, and inaccessible browser APIs. Browser-hidden network information, crashes before telemetry initializes, blocked telemetry, and absent source maps still limit diagnosis. These changes are local and require deployment to affect future production alerts.

Implementation follows [customizing exception capture](https://posthog.com/docs/error-tracking/capture#customizing-exception-capture).
