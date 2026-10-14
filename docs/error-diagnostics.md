# Browser error diagnostics

These changes enrich PostHog exceptions while keeping replay paused. They are local until deployed. They do not suppress errors, record form values, capture request/response bodies or headers wholesale, or retry requests for diagnosis.

## What an exception carries

- Existing normalized exception list/stack, native source URL/coordinates where supplied, and `$app_version` from the Vercel commit.
- Browser connectivity hints, page visibility, page age, navigation type, and sanitized page path.
- Same-origin build-asset failures, recent matching resource timings, and HTTP status when exposed. An unavailable status is unknown, not inferred as success/offline.
- `error_breadcrumbs`: the last 25 observations from up to five minutes, held only in memory and cleared on opt-out. Navigation paths template existing private routes. Click observations contain only the element category and a fixed allowlisted action identifier where explicitly marked; no labels, text, names, inputs, selector IDs, or arbitrary attributes.
- API request breadcrumbs include templated endpoint, method, HTTP status or network/abort category, duration, and supported correlation IDs. External storage/media requests and analytics transport are excluded. API path segments not on a fixed public-segment allowlist become `[id]`; query/hash/credentials are omitted.

The fetch observer returns the original Response untouched and rethrows the original rejection. It neither clones/consumes bodies nor changes request inputs, headers, signals, credentials, or retry behavior. HTTP 4xx and aborts remain breadcrumbs without automatic failure alerts. HTTP 5xx and non-abort network failures emit `browser_request_failed`, at most once per endpoint/method/status per minute, with a bounded dedup cache. Those events carry their breadcrumb context and app version. An accompanying exception can still be reported normally.

Instrumentation is installed only when analytics is enabled. Opt-out removes listeners, restores fetch when our wrapper still owns it, clears breadcrumbs/resource observations, cancels recovery reporting, and removes pending recovery context. In-flight requests finishing after opt-out do not record observations.

## Request correlation

`proxy.ts` assigns a fresh server-generated UUID to non-telemetry `/api` requests. The downstream request and browser response carry `x-request-id`; caller-provided IDs are overwritten. A structured `note2tabs.api_request` server log contains that ID, templated endpoint and method. Use `request_id` from a PostHog request breadcrumb to find that invocation in Vercel logs. `vercel_request_id` is also captured from responses where available.

The authenticated GTE proxy forwards this ID to its upstream. The backend catch-all already forwards the header. Other services need their own propagation/instrumentation for end-to-end backend traces; frontend correlation alone does not create backend traces or ingest server logs into PostHog. Platform-level failures that bypass the proxy may only expose Vercel's request ID, or neither ID.

## Recovery outcome

An enabled diagnostic observer records a guarded chunk-reload attempt in sessionStorage with a random attempt ID, time, sanitized target path and up to five build asset paths. The original exception receives the attempt ID when recovery runs before capture. The reload-loop guard remains separate and unchanged.

On the next mounted application, a two-second observation window emits `chunk_recovery_outcome` with the same ID:

- `page_mounted_assets_loaded`: same sanitized page, the referenced assets have actual downloaded/cached body bytes in Resource Timing, and no error event was seen during observation.
- `page_mounted_unverified_assets`: application mounted, but asset evidence was unavailable.
- `different_page_mounted`: the mounted page differs from the failed target.
- `page_error_after_reload`: another browser error/rejection occurred in the observation window.

This verifies page mount and asset loading, not the correctness of every feature or transcription. No outcome event means unknown, not success: initialization failure, opt-out, blocked telemetry, unavailable storage, or leaving before reporting can all prevent it. Attempts expire after five minutes and are consumed once. No recovery-loop timestamp is cleared by diagnosis.

## Private source maps

The pinned `@posthog/nextjs-config` integration supports the current Next.js 16 Turbopack production build. To activate private uploads, configure these build-only Vercel variables:

```
POSTHOG_SOURCEMAPS=true
POSTHOG_PERSONAL_API_KEY=<private key with error-tracking write access>
POSTHOG_PROJECT_ID=208789
```

The upload UI/API host is `https://eu.posthog.com`, independently of the ingestion host. Release name is `note2tabs-frontend`; Vercel commit SHA supplies release version. `deleteAfterUpload: true` removes generated source maps from deployed assets. Upload failure fails compilation through the uploader; never work around it by deploying public maps. The personal key is not placed in Next's `env` or any `NEXT_PUBLIC_` variable. With uploads disabled, public browser maps remain disabled. Enabling uploads without a key fails configuration explicitly.

A real private upload and production symbolication have **not** been verified: no private upload credential was present in the checked deployment environment files. After configuring it, verify a deployment's upload logs, confirm its `.map` URLs are unavailable publicly, and check that a new real exception resolves to TypeScript source. Uploads only cover builds deployed with the integration; they cannot recover maps from older builds.

References: [PostHog Next.js source maps](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs), [exception enrichment](https://posthog.com/docs/error-tracking/capture#customizing-exception-capture).

## Validation (October 14, 2026)

All 183 suites / 1,048 tests passed, including original-response/error preservation, abort handling, telemetry recursion exclusions, opt-out during in-flight requests, navigation/action privacy, private endpoint templating, proxy correlation IDs, guarded recovery outcomes, and source-map configuration. TypeScript and `git diff --check` passed. A full standard production build succeeded with private uploads disabled; an actual credentialed upload remains unverified. No production deployment or paid transcription was performed, and localhost remains stopped.
