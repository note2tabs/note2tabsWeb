# Note2Tabs analytics contract

PostHog is the analytics source of truth. The former Neon analytics tables and
`lib/analyticsQueries.ts` are legacy compatibility code and must not be used for
current product decisions. `/admin/analytics` links administrators to PostHog.

## Reporting rules

- Filter product reports to `environment = production`. Preview and local data
  must not be included in conversion, retention, or engagement numbers.
- Use `$insert_id` to deduplicate retries. Business outcomes use deterministic
  IDs; ordinary interactions use one generated ID per event.
- A browser session is a stable `$session_id` renewed on activity and expired
  after 30 minutes of inactivity.
- `anon_id` is the stable first-party anonymous identifier. After login it is
  aliased to the account ID. An explicit analytics opt-out clears both IDs.
- Every browser event carries normalized session attribution (`traffic_source`,
  `traffic_medium`, optional `traffic_campaign`, `referrer_domain`, and
  `landing_path`) plus matching `first_touch_*` properties. First touch is
  retained for 90 days and copied to the identified user at login; session
  attribution resets with the 30-minute analytics session.
- `schema_version = 2` is the current envelope. Older rows without it are
  historical data and should not be used to judge envelope completeness.
- Never send email addresses, names, auth/reset tokens, raw error messages,
  transcription content, tab content, or uploaded media metadata beyond the
  documented size/type/duration categories.

## Funnel definitions

### Transcription

`upload_selected` or `upload_dropped` → `transcription_started` →
`transcription_queued` → `transcription_succeeded` →
`transcription_imported_to_editor`.

Use `transcription_failed`, `upload_validation_failed`, and
`upload_storage_failed` as mutually contextual failure events. Segment with
`surface`, `mode`, and `transcriptionModel`; do not infer the model from cost.
The historical `transcription_started_light_model`,
`transcription_started_heavy_model`, and `job_completed` events are retired;
their duplicate counts must not be added to the canonical events.

### Premium

`premium_prompt_shown` → `premium_prompt_clicked` or
`pricing_viewed` → `pricing_cta_clicked` →
`checkout_session_requested` → `checkout_started` → `checkout_redirected` →
`subscription_started`.

`checkout_started` means Stripe returned a usable Checkout session. Only
`subscription_started`, emitted after server-side Stripe confirmation, is a
purchase. Never treat a pricing-page visit or checkout window as conversion.

### Editor engagement

`gte_session_started` and `gte_session_ended` measure visits. Use
`activeDurationSec` from the final event or latest heartbeat rather than wall
clock duration. Meaningful outcomes are `gte_editor_action`, `gte_editor_saved`,
`gte_playback_started`, `gte_practice_started`, and `gte_editor_exported`.
Opening an editor alone is not evidence that someone used it successfully.

## Required envelope

All newly emitted events must include `$insert_id`, `$session_id` when a browser
session exists, `schema_version`, and `environment`. Anonymous browser/server
events also include `anon_id`. Server-only Stripe webhook events use the account
ID and deterministic `$insert_id`; they do not require an anonymous ID.

When adding or renaming an event, add it to `ANALYTICS_EVENTS` or
`GTE_ANALYTICS_EVENTS`, update this document if its meaning affects a funnel,
and add an endpoint or unit test before deployment.

The pinned PostHog dashboard **Note2Tabs — Reliable product & growth
analytics** is the canonical visualization layer. Its data-quality panel should
be checked after every analytics release before conversion or retention results
are trusted.
