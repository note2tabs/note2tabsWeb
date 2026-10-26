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

## Research review (2026-10-26)

Compared official PostHog, Fullstory, Microsoft Clarity and Sentry guidance:

| Common signal | Treatment here |
| --- | --- |
| Rage clicks: clustered rapid clicks | Existing PostHog autocapture with modern defaults; kept distinct from action-outcome incidents. Ordinary rapid note entry is not automatically a custom incident. |
| Dead clicks: no visible response | PostHog's native heuristic supplements explicit outcome checks. DOM changes alone cannot reliably prove canvas edits, audio playback, or downloads worked. |
| Error after interaction | Existing browser exceptions and sanitized click/request breadcrumbs, plus repeated monitored operation failures. A single exception is still captured by the existing error system. |
| Repeated unsuccessful work / slow responses | Explicit action deadlines, outcome checks and stalled Play retries; three failures within 60 seconds is our initial operational rule, not a threshold validated by a published study. |
| Quick backs, excessive scrolling, cursor thrashing | Useful for qualitative review but not added as standalone email triggers: reading music, navigating pricing and scrolling an editor are legitimate behaviors. No new mousemove/scroll monitoring. |
| Form or checkout abandonment | Existing funnel analytics remain the appropriate measure. Leaving a form is not proof of a technical problem. This branch does not attempt to observe Stripe's hosted checkout DOM. |

Fullstory explicitly cautions that productive repeat controls can trigger rage heuristics. PostHog similarly recommends confirming against replays. Treat all signals as review candidates. Prioritize route/action clusters affecting multiple people, and inspect the adjacent request status, browser errors and successful recovery before diagnosing a bug. The custom alert/playlist filters only `frustration_detected`; they do not cover every native rage/dead click. Native signals remain available separately in PostHog.

Sources:
- https://posthog.com/docs/product-analytics/autocapture
- https://posthog.com/docs/libraries/js/config
- https://help.fullstory.com/hc/en-us/articles/360020624154-Rage-Clicks-Error-Clicks-Dead-Clicks-and-Thrashed-Cursor-Frustration-Signals
- https://learn.microsoft.com/en-us/clarity/insights/semantic-metrics
- https://sentry.io/changelog/2023-8-10-user-frustration-signals-rage-and-dead-clicks-in-session-replay/

### Additional validation

Fixed stale retry attribution after explicit failure or a background timeout, and reordered request breadcrumb collection so the triggering failure appears in the incident. Added regression tests for these cases, window expiry/cooldown, device/data-saver canvas settings, excluded replay samples, and the complete fetch-to-sanitized-event path.

A temporary browser harness bundled the actual application modules and installed PostHog SDK and sent only to a local HTTP collector with a dummy project token. Three unchanged edits, three failed submission requests, and a retried stalled playback produced exactly one incident each. Payloads included a session ID and sanitized request context, without the test query token or request body. Productive edits emitted no custom incidents. Consent withdrawal prevented additional incidents. At 6x CPU slowdown with a mobile viewport, 50 successful synthetic button interactions took 2.5 ms and did not add incidents. This harness does not benchmark the full editor or verify native replay rendering. The local harness explicitly allowed its WebDriver browser through the SDK's bot filter; production bot filtering is unchanged.

Read back the live alert and playlist settings. The first scheduled alert evaluation completed without error at a value of zero, as expected before deployment. Production ingestion, replay linkage/rendering, notification delivery on an actual breach, and false-positive frequency still need observation after release. No synthetic production events or paid AI scans were used.
