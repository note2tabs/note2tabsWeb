# Rules-based frustration monitoring

`frustration_detected` is a potential-friction signal for human review, not proof of a bug or emotion. Existing error capture remains unchanged. Instrumentation requires the existing analytics permission and stops/clears pending checks when permission is withdrawn.

## Detection and coverage

Three unsuccessful outcomes for the same action within 60 seconds produce an incident, with a five-minute per-action cooldown on the current page. Successful outcomes break the failure streak. Navigation resets it; cancellation and background-tab timeouts do not count. Repeated Play attempts during a stalled start are counted only after its deadline.

Monitored paths: workspace mutations (including an add-note outcome check), canvas autosave/commit, playback start, existing import/export transfer lifecycle, and requests to transcription submission, upload presign, and checkout creation. Resolved requests/operations acknowledge completion of that step, not the complete user journey: export completion means download initiation, not a verified file on disk. This does not detect every silent editor failure; in particular it does not compare all move/delete outcomes or infer whether audio was audible. Repeated rejected API submissions can include expected validation/limit responses and need human review.

Incidents include action, reason, attempts, elapsed time, sanitized route, stable route/action issue key, existing sanitized breadcrumbs, app version when available, and whether recording is active. PostHog supplies its normal browser/device/session context. No note content, filenames, raw click text, audio, or document snapshots are added to the event.

## Performance and replay

No polling, DOM scanning, global pointer listener, per-frame work, or extra document copies. Successful synchronous edit checks allocate no timers. Asynchronous checks have at most 16 timers, normally with a 30-second deadline (transfers: 120 seconds). Disabled monitoring returns immediately. A local Node microbenchmark of 100,000 successful synchronous checks took about 28 ms; this is not a low-end-device benchmark or a guarantee of zero overhead.

Replay is sampled before recording using a stable random draw stored in sessionStorage: 10% of sessions in the existing eligible countries (JP, CN, PL, ES), still subject to existing consent and sensitive-route exclusions. Storage failures skip recording. It is a per-tab sample, not a global quota or hard billing cap. Canvas capture is 2 fps and disabled when hardware concurrency is unknown/at most two or data-saving is enabled. Input masking and existing network privacy controls remain. Event-only diagnostics work without replay; no paid AI replay analysis is enabled.

## PostHog configuration

- Human-review replay playlist: `Frustration — human review`, ID 1706427; filters recordings for the new event, last seven days, excluding test accounts.
- Affected people by route/action (table): https://eu.posthog.com/project/208789/insights/UPEibeJZ
- Daily unique affected people (line chart): https://eu.posthog.com/project/208789/insights/k1baHOKM
- Daily alert: ID `01a17589-8988-0000-a86e-e7698f6728b6`, sends to the existing Note2Tabs alert recipient when the completed UTC day has at least three affected people across all monitored actions. No AI investigation. Individual incidents remain available even below this email threshold.

Both insights were queried after creation: daily counts zero and route/action table empty, as expected before release. Release the code before expecting signals. Review the first real incidents for expected limit responses and slow-but-working operations before adjusting specific rules; do not suppress broad classes of errors.

## Verification

Focused Vitest suites cover detector thresholds, successful rapid editing, unchanged note-add outcomes, stalled retries, cancellation, consent withdrawal, stale completions, navigation, bounded timers, background tabs, telemetry failures, stable sampling, plus existing PostHog, fetch diagnostics and transfer lifecycle behavior. TypeScript and a production webpack build are checked separately. Browser/device performance and production event delivery still require post-release observation; synthetic production incidents were not sent.
