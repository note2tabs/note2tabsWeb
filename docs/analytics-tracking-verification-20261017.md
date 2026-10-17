# Tracking correctness verification

This audit covers the repository's event producers and delivery paths, not just whether dashboard queries execute. Run `node scripts/audit-tracking-producers.cjs` to regenerate the source-location inventory (269 call sites across 56 files at verification). Generated event names, aliases, transport callbacks and separate lifecycle stages are included; they must not be added together as if they were independent conversions.

## Counting contracts

| Family | One occurrence means | Retry / repeated action handling |
| --- | --- | --- |
| Pageviews | A navigation or persisted back/forward-cache restoration | SDK automatic pageviews remain off; the application owns pageviews |
| Clicks / billing selection | An actual user action | Two real clicks remain two events; transport replays retain one identity |
| Prompt eligible/rendered/shown/viewed | Separate eligibility, render and measured visibility stages | Visibility observers guard one view per exposure; hiding/reopening the home callout resets its view guard |
| Signup completed | Actual account creation | Server-owned email creation and NextAuth createUser; immutable account key/time; cached browser success reports are ignored |
| Login succeeded | Completed client authentication / consumed OAuth return intent | Intent is consumed after asynchronous identity linking, survives effect replacement and is not retriggered by role changes |
| Checkout request / start | A request attempt / a created Stripe checkout session | Attempts and sessions are different; started sessions use a stable checkout key and creation time |
| Subscription lifecycle | A completed checkout or a distinct signed Stripe lifecycle event | Stable keys/time; durable server delivery avoids replaying payment fulfillment solely because PostHog is unavailable |
| Affiliate payment | A commission-bearing invoice | Invoice identity and source time; persisted payload prevents later retry metadata from replacing the original payment |
| Transcription lifecycle | A server job start or terminal job result | Durable job outbox; stable job/event IDs; repeated acceptance does not enable duplicate browser fallback |
| Preview editor opened | Opening the result in the editor | Separate from heavy_preview_completed; opening the editor cannot create another completed job |
| Imports / exports | A transfer attempt, with one terminal outcome | Transfer IDs and terminal guards; download initiation is not proof of disk persistence |
| Import / result navigation errors | Failure to open a persisted result | Separate from job failure or import failure; successful work is not relabelled failed because routing failed |
| Editor telemetry | One visit/session/heartbeat/end observation | Shared acknowledged retry queue; session restarts after back/forward-cache restoration |
| Reminder assignment / outcome | The explicit business key, or an independent scheduler run | Stable insert keys become immutable persisted captures; independent runs remain independent |
| SES delivery/bounce/complaint | One provider notification per recipient | Provider notification timestamp and deterministic UUID survive SNS retries |
| SDK diagnostics | An observed exception, recovery outcome or sampled request-failure category | Diagnostic sampling and SDK delivery differ from business-event counts; never use all-event totals as product usage |

## Fixes and verification

- Browser and editor queues share acknowledged delivery, refused-beacon fallback, per-tab crash recovery, stable retries, concurrent-flush protection, keepalive byte limits and consent-generation guards. An accepted beacon remains unconfirmed until fetch acknowledgement or replay after reload.
- Explicit browser business keys preserve identity/time across remounts. Ordinary actions are not globally suppressed. Unsupported randomUUID uses the cryptographic random-byte fallback.
- Server capture uses an immutable delivery outbox. Successful GTE proxy telemetry remains direct; failed sends after a successful editor operation recover durably without turning the save into a product error. It stores only low-volume server events; browser events and job lifecycle are not mirrored into it. The existing authenticated analytics cron drains pending rows. Delivered identities are retained for 90 days; cleanup never deletes pending rows. Account deletion removes that account's queued captures.
- Server business captures have explicit environment metadata, disable datacenter geolocation by default and avoid creating person profiles for system scheduler identities.
- Identity linking waits for delivery acknowledgement before storing success, retries failures, rotates identities between accounts and avoids attributing old queued events to the new authenticated account. Proxy events retain their original anonymous distinct ID across retries; the server-owned job outbox retains its account identity.
- Fixed Medium being emitted under the Small model's dedicated start-event name and corrected affiliate payment numbering.
- English authentication handoffs now preserve the checkout destination and funnel parameters in the login page's `next` parameter.
- Validation includes regression tests, actual PostgreSQL migration/upsert/retry/concurrency/purge tests, the existing engagement readiness tests against disposable PostgreSQL, production-renderer HTTP failure/retry/opt-out checks, and a browser pricing/action/handoff run against a local capture fixture. The fixture did not send synthetic events to production PostHog or create payments.

## Interpretation and limits

Delivery is at least once, with stable identity and time for PostHog deduplication. A retry can legitimately appear more than once at the HTTP receiver; that does not represent additional user actions. Counts must use the metric's account/person/job/checkout/transfer key rather than adding lifecycle-stage events or interpreting retry receipts as conversions. Deduplication at the external service may be eventual.

This is not a mathematical guarantee that every possible browser, SDK, extension or infrastructure failure is tested. Browser recovery is bounded (24-hour pending-event retention and finite queue capacity) and depends on usable browser storage; an event lost before it can be persisted cannot be reconstructed. Server delivery still requires a successful database enqueue. SDK identity/diagnostic delivery remains subject to provider behaviour. These boundaries are not evidence that missing observations are zero usage.

New signup counts have broader coverage because account creation no longer depends on loading the success screen. Mark the rollout when comparing cohorts. Historical duplicate timestamps, missing events, identity merges or old model-event labels are not rewritten by these code fixes. First-touch acquisition in browser events describes the recorded attribution, not a proven causal source.

Background persistence is registered with the platform using the documented [Vercel waitUntil helper](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil); it remains subject to the function timeout.
