# Frustration alerts: audio fixes and remaining investigation

Reviewed 26 events across 25 sessions / 17 distinct IDs, 26 October–5 November 2026. The 90-day query found no older frustration events. None of the 25 sessions has a recording available. Times below are Europe/Stockholm.

## Fixed on this branch

1. Unsupported Ogg Opus decoding previously rejected playback with no compatible alternative. Sampled instruments and drums now have MP3 alternatives selected by browser capability, plus a decode-error fallback if capability detection is inaccurate. This is a strong explanation for 15 of the 16 immediate playback-failure alerts (older Apple browsers), not retrospective proof of every individual cause.
2. A failed sample fetch previously remained cached for the lifetime of the page. Failed fetches and prepared-instrument/kit promises are now evicted, so another attempt can recover without reloading. Drum preparation no longer caches a permanently empty/partial kit after failure.

Both bugs were reproduced in failing tests before changing implementation. Existing successful/in-flight downloads remain shared. Opus-capable browsers retain the existing format. The 235 MP3 assets add about 25 MiB to deployed static assets; clients request their chosen format, not both unless a decode fallback is needed. No database or backend changes.

Validation: 64 tests across 13 playback/instrument suites; TypeScript; webpack production build; all 235 MP3 fallbacks decoded to non-silent audio in Chrome using the actual loader with Opus capability disabled; injected HTTP503 retry and forced native decode failure recovered in the browser. An actual old Safari/iOS device was not available, so native-device confirmation remains useful. Conversion script requires local ffmpeg and is deliberately not part of deployment builds; generated files and their content hashes are committed.

## Unresolved incidents for engineering

| Incident | Known evidence | Next investigation |
|---|---|---|
| Five playback stalls: Oct 27 11:08 (ID), Oct 28 13:53 (US), Oct 30 18:30 (US), Nov 1 12:22 (RU), Nov 5 13:02 (IQ) | Repeated attempts exceeded the 30-second monitor deadline. Iraq also had successful API requests lasting 23.9 and 34.1 seconds. Russian session contains playback-pause/practice activity, so the timeout does not prove permanent failure. | Distinguish sample download/decode waits, suspended audio context, cancellation and later recovery. Add bounded stage/error timing before changing timeout behavior. These fixes do not add a network timeout. |
| Android playback, Nov 5 11:02, Philippines | Immediate failure after roughly 1.16 seconds; browser Chrome 156 / TECNO Android. Earlier editor request had a network error. | Real decoder/audio-context exception is missing. Retry changes may help a temporary fetch failure, but this incident's cause is unconfirmed. Session 01a1ab28-9b26-7e99-b9e5-9e8c0abf927e. |
| Upload preparation, Oct 31 13:04, Ukraine | Three HTTP400 responses from /api/uploads/presign, no accepted transcription nearby. | Determine invalid file metadata versus upstream rejection. Exact historical response body/rejection code was not retained. Session 01a191d2-0c16-7c6e-9400-c408386ebad6. |
| Submission rejection, Nov 4 03:40, India | Three HTTP403 responses from /api/transcribe. Current account is verified/free with three credits; this does not prove its historical balance or rejection reason. | Identify credits, plan entitlement, verification or other policy response. Preserve machine-readable rejection reason in telemetry. Session 01a1a46d-5da6-71ee-8a4e-002bed57a2aa. |
| Save incidents, Oct 27 06:49 (Japan) and Nov 2 20:53 (Sweden) | Japanese session saved successfully before and after a timeout. Swedish session had network failures and later successful saves. No established permanent data loss. | Verify recovery/revision continuity, separate slow autosave from failed explicit save. Sessions 01a17be3-1d87-7558-83bf-16cfb6fd2ee8 and 01a19dcf-4e5c-747a-b8f4-7959b6caa047. |

## Previously fixed, independent of this branch

The Nov 4 14:08 import incident was an empty-result job repeatedly failing finalization with HTTP400. Job 1531b89f-a1a5-4664-a84d-f58a5c215b61 now has terminal no_notes / completed result-delivery markers and a four-credit refund dated Nov 5 03:34. Do not interpret all the repeated scheduled retry events as additional affected users.

## Remaining observability gaps

- Playback catches exceptions and displays their message but does not attach that exception type/message or a preparation stage to the frustration event. This branch does not change that telemetry.
- Many button breadcrumbs have no specific action name. External sample failures are not preserved as detailed request breadcrumbs.
- A superseded/cancelled playback request can enter the same catch path as a real playback failure; this needs explicit cancellation classification rather than blanket suppression.
- Replay is intentionally limited to JP/CN/PL/ES and a 10% per-tab sample. Eight alerts were in eligible countries, but all recording lookups were unavailable. Expanding coverage requires a deliberate sampling/privacy/budget decision; no replay settings changed here.

Source compatibility reference: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
