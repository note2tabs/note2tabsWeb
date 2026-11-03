# Vercel resource optimization review

## Release state

Vibrato/editor fixes were merged and pushed to website main at `c6f265b8`.
Resource optimizations are on `perf/vercel-resource-optimization`, not pushed or deployed.
The branch also includes main's subsequent transcription-delivery fixes through `0b8300c8`.
No backend repository changes, migrations, infrastructure changes or live database writes were made.

## Changes and expected effects

- Public localized pages with request-independent loaders can now be CDN-cached for one hour, varying by `X-Vercel-IP-Country`. Authenticated loaders, private routes, preview mode, Authorization requests, cookie-derived currency fallbacks and explicitly private responses remain uncached. Localized landing pages use the same static-data adapter as other public content.
- Public HTML installs the same three non-sensitive currency/market/tax-display cookies in a small script before hydration. Removing HTTP Set-Cookie from these responses makes CDN caching possible. Client navigation, private pages, English pages and language redirects retain their existing cookie path. Server-rendered currency/pricing props are unchanged.
- Public translation catalogs are serialized once per locale per server instance rather than once per document. Serialized content is unchanged.
- Every referenced instrument/drum sample has a content hash in its URL. Only versioned URLs receive year-long immutable browser caching. Dev/build hooks regenerate hashes when sample bytes change. No samples are re-encoded or duplicated.
- Authenticated lane saves request the backend's existing lane-only response contract, including tools without a merge base. Canonical server notes, revision guards, conflicts and full-canvas saves remain intact.
- Unchanged preference groups are not rewritten when a confirmed base proves they are unchanged. PostgreSQL upserts also avoid updating identical rows. Acknowledgement-only responses skip preference hydration queries. Snapshot responses still hydrate saved preferences.
- Middleware excludes API endpoints it previously entered only to immediately return without diagnostic work. Other API correlation IDs remain enabled.
- Concurrent same-account/job/validator polls can share a Web Lock and a status response less than one second old across tabs. Full-output requests always fetch normally. The existing 7.5-second polling cadence, validators, retries, completion handling and fallback behavior are preserved. Storage/lock failures do not break polling or cause an immediate duplicate retry.

## Validation

- Production build and TypeScript checks, with DATABASE_URL disabled and backend pointed at a closed localhost port.
- Production HTTP checks: country-specific cache headers, private-route exclusions, early preference script, API authentication and sample cache headers.
- Fifteen before/after production-server HTML comparisons across Spanish, French, Arabic and Japanese pages and US/Swedish/Argentinian geography: identical visual markup after excluding scripts.
- Every instrument/drum playback URL checked against SHA-256 of its original sample file.
- Isolated PostgreSQL/PGlite test: unchanged settings retain their prior update timestamp; changed settings persist and hydrate correctly without altering canonical notes. This never connects to Neon.
- 166 tests passed across 22 focused editor, guest persistence, transcription delivery/finalization, retry, geography, currency, region-pricing and polling suites. Optional SQL test runs with `N2T_PGLITE_MODULE` pointing to a disposable local installation.

## Limits and follow-up

Local checks cannot prove actual Vercel CDN hits or monthly savings. Validate MISS-to-HIT behavior, country separation and usage changes on a deployment before claiming a percentage reduction. Public content may be served from the one-hour cache, consistent with the existing English blog revalidation interval; deployed code/assets receive new deployment cache state and modified samples receive new hashes.

The visual markup comparison is not an interactive browser or pixel review. Live authenticated checkout and a real Cloud Run transcription were not exercised. No optimization changes playback audio, note data, editor controls or normal save/poll timing.
