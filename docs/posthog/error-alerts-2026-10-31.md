# Error alert investigation — October 31, 2026

Read-only triage of PostHog project208789, last48hours. Four issue fingerprints represent three failure categories. All observed occurrences predate the instrument SEO deployment at20:37UTC onOctober31.

## Confirmed recovery defect: Chinese sign-in → sign-up

Issue: https://eu.posthog.com/project/208789/error-tracking/01a08138-c26d-7932-8a0b-4e893237bc13

Two ChunkLoadError occurrences, one mainland-China visitor, Android Chrome146, October31 at12:48:06 and12:48:30UTC (13:48 Stockholm). The user selected a file on the Chinese homepage and followed the authentication handoff to `/zh-hans/auth/login`.

The first failed resource was a same-origin Next build chunk. Captured resource timing reports HTTP200 but encoded body size0; that is not proof of a missing deployment asset, a Google dependency or a specific network cause. Both chunk files were retrievable from the immutable production deployment during investigation.

Automatic recovery reloaded sign-in. The captured outcome was `page_mounted_unverified_assets`, not verified complete asset recovery. The form subsequently submitted a credentials login, which returned401/`credentials_rejected`. The visitor then clicked sign-up. Breadcrumbs show navigation start for `/zh-hans/auth/signup`, navigation error, and `retry_guard_blocked`. No completed sign-up is recorded in the inspected journey.

The code guard used one five-minute timestamp for every route. A recovery on login therefore disabled recovery on signup. A regression test reproducing that exact sequence fails before the change (no navigation to signup) and passes after it.

Fix: keep a bounded, privacy-safe history of recovery destinations. Allow one recovery per sanitized pathname, with a global maximum of three distinct destinations in five minutes. Queries, fragments and private editor IDs are not retained. Repeating the same page, changing only its query, alternating previously attempted routes or exceeding the cap stays blocked. Legacy timestamp-only attempts and unavailable storage remain conservatively guarded. Intended same-origin destination/query handling remains intact; no external redirect is introduced.

This fixes our recovery behavior, not every possible failed asset download in mainland China. No user-facing confirmation, extra step or alert suppression is added.

## Homepage React hydration errors: cause unconfirmed

Issues:
- https://eu.posthog.com/project/208789/error-tracking/01a16842-b473-7512-83bf-94ea0fa9f4a1
- https://eu.posthog.com/project/208789/error-tracking/01a16842-b473-7512-83bf-94ffd7ce3665

One Bangladesh desktop Chrome156 visit atOctober30 15:14:11UTC: eight React418 errors and one423. These indicate hydration mismatch and fallback to client rendering; they are not nine affected users. Only a later pageleave is recorded for this person in the inspected interval. There is no linked replay, and the minified stack has no uploaded sourcemap, so the mismatched node or its cause is not established.

Fresh production homepage checks on desktop and a390px slow4G browser produced no captured errors. No hydration suppression or speculative markup change is included. Browser DOM modification/translation and an application mismatch remain possibilities, not findings.

## PostHog request timeout rejections: root cause unconfirmed

Issue: https://eu.posthog.com/project/208789/error-tracking/01a18cb1-10b6-7bf1-bab9-60453f77a268

Twenty `AbortError: PostHog request timed out after 60000ms` events across two people, October30 12:02–12:27UTC. The inspected Australian user subsequently completed a Light transcription, imported it and used the editor. An earlier upload/submission failure is recorded too, followed by successful submission; timing alone does not establish that the analytics abort caused it.

An isolated test of the installed PostHog transport with our fetch instrumentation and an intentionally stalled request produced the expected timeout callback without an unhandled rejection or recursive diagnostic request. Thus the global rejection observed in production has not been recreated. No broad AbortError filtering, transport change, SDK update or alert suppression is included. The test/probe log is `/tmp/n2t-posthog-timeout-repro.log`; the temporary probe source is `/tmp/n2t-posthog-timeout-repro.test.ts` (not a committed test).

## Validation and status

- Recovery regression demonstrably fails before the implementation change and passes afterward.
- 76 tests passed across recovery, outcome reporting, browser load diagnostics, diagnostic fetch, PostHog client and analytics privacy suites.
- TypeScript and production webpack build passed.
- Existing tests preserve same-origin navigation, storage-failure safety and duplicate-event guards; new tests cover independent route recovery, repeated destinations, query changes, cap and expiry.
- No production data, alert settings or customer projects were changed. This branch is not merged or deployed.
