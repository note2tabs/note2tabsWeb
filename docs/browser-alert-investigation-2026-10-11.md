# Browser alert investigation — 2026-10-11

Alerts and exception exclusions were left unchanged. No transcription requests or paid model runs were made. Changes below are local and have not been deployed.

## Same-URL navigation on the Chinese homepage

PostHog issue: `01a12c5b-4242-74d1-a0f7-fe722b8e9448` (2 exceptions, 1 user).

The reported invariant compares `/zh-hans` against `https://www.note2tabs.com/zh-hans/`. The locale provider compared raw strings, so it attempted a replacement even though Next treats these paths as the same route. Saving a language also caused two navigation owners: Settings called `router.replace`, while saving dispatched the preference event that made the provider call `router.replace` again. The quick selector likewise combined a Link navigation with the provider redirect.

Fix: use a shared destination comparison that ignores the pathname's trailing slash while preserving search parameters and fragments. Use it in client preference enforcement and server language detection. Settings and normal selector clicks now save the choice and let the provider own navigation. Modified link clicks retain normal browser behavior. The provider waits for router readiness.

Reproduction: a regression test using the reported trailing-slash shape failed for all 7 translated locales before the fix and passed afterward. The precise production invariant was not reproduced in Chrome: the local server canonicalizes incoming trailing slashes before rendering. Browser checks confirmed English → Chinese → English Settings navigation, fragment preservation, and Chinese homepage entry without navigation errors.

## Safari `EmptyRanges` reference error in the editor

PostHog issue: `01a11e9a-a56e-78a3-a918-80ce8805e321` (27 exceptions, 2 users).

This identifier belongs to WebKit's native media controller, not this repository. Its `NullMedia` fallback used bare `EmptyRanges` in the `buffered`, `played`, and `seekable` getters. WebKit fixed these references to `MediaController.EmptyRanges` on July 4, 2026:

[WebKit fix and regression test](https://github.com/WebKit/WebKit/commit/b13f9879ad3ca87db952d919932d0f31e52b38ea).

Our tutorial previously discarded autoplay video elements when changing cards or closing the dialog without explicitly releasing playback. It now pauses the old video, removes its source, and calls `load()` during ref detachment. This follows the existing editor practice replay cleanup pattern. Tests verify cleanup order, replacement, and repeated detach behavior.

Status: mitigation, not a confirmed resolution. No affected Safari instance was available to reproduce its native controller/garbage-collection failure. The alert samples have no usable app stack or nearby interaction events, so the tutorial is not established as their trigger. Chrome checks covered video → video → image, close, and reopen without errors. Safari verification and post-deployment monitoring remain necessary.

## iOS Chrome stack overflow on `/transcribe`

PostHog issue: `01a12710-f23d-7463-9bc8-81852dea290c` (2 exceptions, 1 user).

Reported frames include `Lk` → `Jk` → `Lk`, inline on line 225, followed by lines 197, 189, and 196. Fetching Google's current browser translation payload reproduced an exact source match: line 225 defines those functions and their mutually recursive fallback. Lines 189, 196, and 197 also contain the matching protobuf accessors. The deployed transcriber HTML contained only 83 lines and did not define those functions.

Primary sources:

- [Chromium translation script loader](https://chromium.googlesource.com/chromium/src/+/main/components/translate/core/browser/translate_script.cc), which requests `translate.googleapis.com/translate_a/element.js`.
- [Matching Google translation payload](https://translate.googleapis.com/_/translate_http/_/js/k=translate_http.tr.en_US.wPNTICmV8zY.O/am=QACAAQ/d=1/ed=1/rs=AN8SPfoVpoxgYySN3qwfNLwggEauNXOgvQ/m=el_main), fetched during the investigation. Asset names can change with Google releases.

Status: the stack originates in Google's translation code; the state that triggers recursion is still unknown. It was not reproduced on an iOS device. No speculative app fix or translation restriction was added. The next useful reproduction is opening `/transcribe` in affected iOS Chrome and translating it, recording source/target languages and whether the error occurs before choosing a file. Then compare with browser translation off. Keep the alert active until that reproduction establishes an actionable app interaction or Google releases a fix.

## Validation

- 139 tests passed across 9 related localization/tutorial suites.
- `npx tsc --noEmit --incremental false` passed.
- `git diff --check` passed.
- Local Chrome browser checks covered Settings switching, Chinese homepage entry, transcriber rendering, and guest editor tutorial card transitions/close/reopen. These checks do not substitute for Safari or iOS reproduction.
