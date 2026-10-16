# Upload rejection reproduction — October 16, 2026

## Findings and limits

The affected production session received four HTTP 403 responses during the
direct Cloud Storage upload. Presigning succeeded; transcription never started.
The production frontend discarded the storage response body, so the precise
storage rejection code cannot be recovered from that session's analytics.

PostHog's country changed from France to Iran, but three failures preceded that
change. This does not establish a VPN as the cause or identify the IP address
seen by Cloud Storage. The inspected session and signing code do not bind an
upload to the visitor's IP. Bucket configuration has no IP filter.

Storage request and policy-denial log queries for 09:55–10:11 UTC returned no
entries. Project Data Access audit logging and bucket access logging were not
configured. The investigator lacks both signBlob and getAccessToken permissions
on the production signing service account. No permissions were changed.

**The exact production cause remains unknown. No real VPN switch, two-egress
Google upload, or production signed-upload reproduction was completed.**

## Controlled reproduction

Used an isolated Chrome context, a synthetic 44-second WAV, and localhost-only
mock APIs. The baseline browser loaded the live production page's JavaScript
through a local proxy. The modified browser loaded a local optimized production
build. All upload and transcription requests were intercepted locally; no
customer file, real account, inference, or production write was used.

| Scenario | Baseline | Modified build |
| --- | --- | --- |
| Storage 403 AccessDenied, no expiry indication | Generic transfer error; stale “Transcribing audio…” text | Visible transfer error, cleared progress, selected file retained; no automatic retry |
| Storage 403 explicitly saying request expired | Stops after first upload | Fresh presign and upload once; proceeds with the new key |
| Connection dropped during PUT | Transfer error; stale progress text | Transfer error with network classification; cleared progress; file retained |
| Manual retry after restoring transport | Fresh URL works | Fresh URL works; no change needed to file retention or manual retry semantics |
| Transcription endpoint rejects after successful upload | Stale progress text | Progress cleared; server error remains visible |

Chrome can itself retry an idempotent PUT after a socket reset. The fixture logs
showed multiple PUTs with generation 1 but only one presign. These are transport
retries, not an application retry loop.

Browser checks covered `/transcribe` and the homepage's upload handler. To keep
the authenticated homepage handler available rather than redirecting to `/home`,
the local homepage fixture used the resume query with unavailable handoff
storage. This was test setup only; authentication/navigation code was unchanged.

## Changes

- Shared signed-upload helper for both pages, retaining existing verification,
  size, credit and plan gates.
- Renew once only for a storage 403 with an explicit expired-request indication.
  Unexplained access denials, signature errors and network errors do not trigger
  automatic application retries. Transcription is submitted only after upload
  succeeds.
- Record bounded, allowlisted storage codes, HTTP status, attempt, elapsed time,
  browser online state and a request ID when CORS exposes it. Read at most 8 KiB
  and wait at most one second for an error body. Never send raw response text,
  signed URLs, object keys, filenames or file contents to analytics.
- Classify an HTTP rejection as storage failure rather than deriving a network
  error from translated display text. Send details through both transcription-failure and
  upload-failure events, plus a retry event when expiry recovery is attempted.
- Clear progress on caught failures, server rejection and invalid responses.
  Existing translated messages are reused; no locale-specific behavior added.

An expired URL is a demonstrated recoverable case, **not the confirmed cause of
the production incident**. Reported failures roughly 17–22 seconds after presign
are not a strong match for the inspected default 60-second expiry.

## Validation

- Original live-snapshot validation: 187 files, 1,104 tests passed.
- Main-based validation: 184 files, 1,061 tests passed; optimized production build passed.
- The merge branch is based directly on main and excludes other pending pricing,
  session replay and general blocked-submission instrumentation changes.
- New HTTP integration tests use a local HMAC-signed endpoint that actually
  verifies the signature and expiry; cover renewal, repeat expiry, access denial,
  connection reset/manual retry, verification gate, telemetry failure and hostile
  or stalled response bodies.
- Optimized production build passed with `next build --webpack`.
  The default Turbopack build initially could not resolve dependencies outside
  this isolated worktree; no production build configuration was changed.
- TypeScript check passed; final build also ran TypeScript.
- Both pages tested in Chrome against local mocked APIs, including the renewed
  URL reaching the locally intercepted transcription endpoint.

Local branch only. No alert suppression, merge, deployment, IAM change or logging
configuration change.
