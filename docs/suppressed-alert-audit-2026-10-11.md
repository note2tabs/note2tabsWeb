# Suppressed alert audit — 2026-10-11

Read-only audit of Note2TabsAnalytics (PostHog project 208789), the preceding 45 days, repository exclusion rules, their Git history, and the live operational alert query. Counts below are debugging aggregates, not governed catalog metrics; the catalog is empty. Raw counts include internal/test accounts unless stated otherwise. No alert settings, issue statuses, application behavior, or paid model services were changed.

## Findings

136 captured exception events have `alert_eligible = false`: 124 classified as browser errors, 11 as recoverable chunks, and 1 as an expected state. No ingestion suppression rules currently exist. These records remain available for investigation.

The operational alert also independently excludes generic script, extension bridge, and chunk-loading failures in its saved SQL, even for historical events with `alert_eligible = true`. Separately, one issue has PostHog status `suppressed`: the Safari autofill bridge issue below. All 22 issues observed in the window were inspected by status; none were omitted by pagination.

| Exclusion | Retained excluded events | Assessment | Action |
| --- | ---: | --- | --- |
| Extension update bridge | 108, 5 distinct users | Sample is a synthetic non-Error rejection without a stack; extension-shaped `Object Not Found Matching Id … MethodName:update … ParamCount:4`. No demonstrated Note2Tabs cause. | Keep narrowly scoped; do not generalize to all promise rejections. |
| Generic `Script error.` | 15, 3 users | Sample has no stack or source. Cannot prove harmlessness or assign it to app code from available data. | Keep out of individual paging, retain counts and investigate a spike or accompanying app failures. |
| Chunk-loading failures | 11, 8 users | Genuine first-party app-loading failures, not browser extension noise. Recovery cannot be assumed merely from the message. | Amend recovery/monitoring as described below. |
| Short `Error: La` | 1, 1 user | Has an inline stack, contrary to the filter's assumption that there is no diagnostic context. Inline functions `Vi` and lines 194/195 resemble injected translation code, but this older asset version was not positively matched. | Do not suppress every short Error by length alone; assess source/context. |
| ResizeObserver loop | 1, 1 user | Landing page `/mp3-to-guitar-tabs`, no useful stack, no demonstrated repeating layout failure. | Low priority; no evidence justifies a speculative editor layout change. |
| Safari autofill bridge | 1 explicitly suppressed issue; captured before its client filter classified it | Two non-app frames with no source URL and `sendExtensionMessage("getUrlAutofillTargetingRules")` in the message. | Leave the specific issue suppressed. |
| Safari `Load failed` | 1 historical alert-eligible event before the filter update | Unhandled TypeError on `/auth/login`, no stack. Transient network failure is plausible; a broken first-party request cannot be ruled out. | Do not equate all network failures with expected user state. Handle failures at their call site and retain operation/status context. |

Some users occur in multiple message variants, so user counts must not be summed across rows. Chunk issue aggregates were also checked with PostHog's internal/test exclusion enabled and did not change. The 11 events refer to events captured after the client chunk filter took effect; all chunk issues together contain 14 events in the same window, including earlier alert-eligible events.

## Highest-priority amendment: chunk recovery

On September 20, one user saw three chunk errors on `/transcribe` at 09:22:30.955, 09:22:31.012, and 09:22:50.335 UTC, followed by page leave at 09:22:57.804. Correlating by PostHog `person_id` also finds six `stale_chunk_recovery_failed` events for that user between 09:20:05 and 09:22:00. A transcription start was recorded at 09:20:41, so the evidence shows degraded loading/recovery, not a completely unusable session or a proven failed transcription.

The custom event uses our analytics-proxy session ID, while browser exceptions use the PostHog SDK's session ID. Querying only the exception's session ID initially misses the recovery failures. This is an investigation gap, not proof that the notification signal failed. The live alert includes `stale_chunk_recovery_failed`, so recovery failure remains alertable.

`lib/staleChunkRecovery.ts` defines a five-minute retry guard but removes its session-storage marker after ten seconds of boot time. Boot time does not verify that the route or missing chunks recovered. The per-page `reloadStarted` flag still prevents multiple reloads in that page instance, but a fresh page can clear the marker and reload again.

Offline reproduction using the current module and simulated storage/timers:

1. Chunk failure on page A at t=100s causes reload #1 and stores its marker.
2. Page B installs recovery at t=101s.
3. Its ten-second timer clears the marker.
4. A chunk failure at t=112s causes reload #2, with zero recovery-failure reports, still well inside five minutes.

This reproduces a monitoring/retry gap; it does not establish that a specific historical user's failures took this path. Recommended amendment: retain the retry marker through the intended guard window or clear it only after verified recovery, preserve once-per-incident reporting, and verify failed recovery rather than marking every chunk exception as recovered. Sourcemaps are missing for the observed first-party chunk frames, limiting root-cause analysis of why the assets failed to load.

## Other amendments: classification precision

`classifyPostHogException` searches every string in the exception object, including stack source paths, when matching expected states. Its short-error rule does not inspect the stack or source. Three offline reproductions with the existing classifier:

- A `TypeError: Cannot read properties of undefined` with an app frame `/app/quota.ts` becomes `expected_product_state` merely because the filename contains `quota`.
- An `Error: DB` with an app frame `/app/save-tab.ts:42` becomes `non_actionable_browser_error` solely because its message has two characters.
- An unhandled `TypeError: Failed to fetch` from a first-party save operation becomes `expected_product_state` without evidence of offline state, cancellation, or safe recovery.

These are demonstrated potential false negatives, not claims that those exact synthetic examples occurred in production. Recommended amendment: classify exception messages/types separately from stack metadata; require every exception in a captured exception chain to be benign before excluding the whole event; use operation-level handling for anticipated network/auth/quota responses; keep unknown errors with useful first-party source context alertable. Browser tooling can incorrectly mark injected inline frames `in_app`, so that boolean alone is insufficient to establish app ownership.

No captured suppressed events in this window show real file-size, fret-validation, credit-quota, authentication, or rate-limit errors being hidden by those respective message rules. Their broad patterns still deserve narrowing because of the reproduced classifier collisions.

## Source links

- [Repeated chunk issue](https://eu.posthog.com/project/208789/error_tracking/01a08115-df4c-7001-8ef8-26a65dd19705)
- [Other recurring chunk issue](https://eu.posthog.com/project/208789/error_tracking/01a08138-c26d-7932-8a0b-4e893237bc13)
- [Latest excluded chunk, October 10](https://eu.posthog.com/project/208789/error_tracking/01a12443-d47c-72b2-a86e-bf6f8de98d84)
- [Short error with stack](https://eu.posthog.com/project/208789/error_tracking/01a10c44-4e11-7bd0-80f9-339958b33797)
- [Extension update bridge](https://eu.posthog.com/project/208789/error_tracking/01a06885-54d4-7a02-b6a5-3863fb1a3fb4)
- [Generic script errors](https://eu.posthog.com/project/208789/error_tracking/01a07310-8a33-7422-bba8-9ea8b8206375)
- [Safari autofill issue](https://eu.posthog.com/project/208789/error_tracking/01a0d8df-451a-7f22-8f15-a17926dd6903)
- [Safari network error](https://eu.posthog.com/project/208789/error_tracking/01a0e238-7860-7b60-bac8-0a3471db460c)
- [Live alert and saved query](https://eu.posthog.com/project/208789/alerts?alert_type=insights&alert_id=01a05a46-45dc-0000-b434-650a577abe36)

## Local implementation following the audit

The subsequent authorized fix removes the ten-second marker reset from `lib/staleChunkRecovery.ts`. A second failure inside five minutes reports once per page instead of causing another reload. An expired marker permits a later recovery. If session storage cannot preserve the guard, the failure is reported instead of starting an unguarded reload. Listener cleanup remains intact.

`lib/analyticsPrivacy.ts` now classifies only exception type/message, requires every exception in a chain to qualify for exclusion, and leaves malformed entries, short messages, unhandled network failures, and generic script errors with source context alertable. Specific extension exclusions and expected validation states remain intact.

Google OAuth startup on login/signup previously had uncaught async failures. Both forms now use `lib/oauthSignIn.ts` to handle rejected requests and provider errors, clear unsuccessful OAuth intent, display the existing localized retry message, and restore the form buttons. Handled startup failures emit `login_failed` or `signup_failed` with `method = google` and `error_code = oauth_start_failed`, without raw error contents. The existing editor save/retry handling already catches network failures and keeps pending changes; it was reviewed and left intact.

Verification: 1,000 tests passed across 175 suites; TypeScript and `git diff --check` passed. Regression tests cover the original timer gap, blocked storage, guard expiry, listener cleanup, classifier false negatives, OAuth rejection/retry, and provider errors. Local Chrome checks cover localized auth recovery messages and console errors. No actual Google sign-in or paid model request was made. These application changes have not been deployed.

The cause of the original asset fetch failures is still unconfirmed: missing/retired deployment assets and network failures both remain plausible. Fixing retry behavior does not guarantee that the first chunk request will succeed. The installed Next.js already consumes `NEXT_DEPLOYMENT_ID`; no speculative deployment-ID override was added. [Vercel's Skew Protection documentation](https://vercel.com/docs/skew-protection) describes deployment routing, which requires checking the actual project settings before claiming deployment skew is addressed.

The existing PostHog insight `YIsrN83Y` was also amended live at 19:45 UTC. Its duplicated JSON substring exclusions could override a correctly classified app error, including an event containing both a real error and a chunk failure. The insight now respects `alert_eligible` without those extra exclusions. Before/after dry runs both returned 2 for the current hour. Read-back verified the saved query and preserved alert enablement, hourly schedule, recipient, threshold, and scheduler/email failure logic. `docs/posthog-actionable-alert-query-2026-10-11.json` contains the exact before/after definitions for review or rollback. This monitoring correction is live; the application fixes still require deployment.


## Follow-up: conservative exclusions (October 11)

At the user's request, the local classifier now defaults all unhandled exceptions to alertable. This supersedes the earlier policy described above: generic script errors, product-state keyword matches, ResizeObserver errors, cancellations and chunk-load errors are no longer excluded. A chunk reload attempt does not demonstrate successful recovery, so its original exception also remains alertable.

Only the two observed extension signatures are allowlisted, with exact case-sensitive messages and error types. The Chromium signature allows a numeric bridge ID but requires `ParamCount:4`; Safari requires the entire observed autofill expression. Any source or stack context prevents suppression, including non-app frames and unknown stack formats. Every entry in an exception chain must qualify. Missing or malformed exception lists now receive `alert_eligible = true`, overriding any incoming false eligibility property.

This is intentionally conservative: variants and otherwise harmless browser issues may alert until investigated. New exclusions should identify the origin and specific signature, and include tests proving app errors and neighboring message variants remain alertable. No new PostHog issue suppression or ingestion rules were added. The previously saved operational insight already respects eligibility without independent message exclusions. The application policy is local and needs deployment to affect new production captures; historical classifications are unchanged.

Validation: 175 test suites / 1,003 tests passed; TypeScript checking passed. Regression coverage includes broad product-state words, opaque script errors, chunk failures, extension variants and source context, mixed chains, sparse arrays, and missing capture payloads.
