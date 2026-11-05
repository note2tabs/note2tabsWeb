# Playback startup stall investigation — 2026-11-05

The hourly alert contained `editor_play / repeated_no_progress` at 19:30:31 UTC from Google Search App on iPhone. Three presses were counted while a startup action remained pending for 30 seconds. No replay or audio exception was captured. The saved editor was fetched read-only for investigation; production customer data was not changed.

The editor contains two tracks, 172 notes and six chords. Both currently use legacy `gm:piano`, correctly mapped to the recorded upright piano bank. Its snapshot plays normally in Chromium and in Playwright WebKit 26.4 with an iPhone viewport. WebKit's Opus capability report did not guarantee decoding; the existing MP3 fallback loaded successfully. This test is WebKit on macOS, not the customer's actual iPhone/Google app.

## Reproduction

Loaded an isolated local guest copy of the exact snapshot. Replaced the browser AudioContext.resume implementation with a never-settling promise, matching the pending-start path under investigation.

On unchanged main, after 6.5 seconds the Play button remained disabled, no error was shown, and a later attempt could not retry. The existing frustration detector would report this pending action after 30 seconds once retries were counted.

With this fix, activation expires after five seconds, the original context is closed by the existing catch path, the pending flag is cleared, the existing playback-blocked message is shown, and Play is enabled. Restoring normal activation and tapping again successfully starts playback. No repeated import, save, or backend request is involved.

This establishes a reproducible client bug, **not proof of the customer's exact trigger**. A pending sample download or decode could also hold startup open. This patch deliberately addresses activation only; it does not claim all playback stalls are resolved.

## Fix and diagnosis

Share the gesture-synchronous activation helper between global and per-track/preview playback. Bound activation to five seconds; clear the timer on success or failure and handle late promise settlement without restarting playback. Add consent-gated, fixed-vocabulary audio breadcrumbs containing stage, outcome, audio-context state and timeout/blocked classification. Clear the matching audio error on a new attempt without clearing unrelated save errors.

The helper adds one timer per activation, no polling, frame callbacks, extra database requests, or additional analytics event streams. Repeated failures continue to use the existing frustration alert.

Relevant browser implementation history: https://bugs.webkit.org/show_bug.cgi?id=273511 and https://bugs.webkit.org/show_bug.cgi?id=248265. These support testing activation stalls but do not establish a regression in the user's iOS release.
