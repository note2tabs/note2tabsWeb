# Server and translation delivery optimization review

Branch: `perf/server-and-translation-delivery`. No deployment or production database changes.

## Changes

- Simultaneous status reads share an upstream request only when the job ID and all request headers match, including user identity and ETag. Authentication still runs per request. Completed results are not cached, output downloads are not shared, and the map is bounded to 100 pending reads. Polling frequency is unchanged.
- Complete non-English catalogs load before hydration from content-hashed static scripts, preloaded in the document head. Browser/CDN caching can reuse them across documents. English keeps its tiny inline overrides. Locale switching and editor translations retain their existing loaders. Catalogs regenerate before development and production builds.
- Analytics persistence and acknowledgements use batches of up to 100. Original event identity, timestamp and properties remain immutable; failed sends or acknowledgements remain retryable. No retention, scheduling or event collection changes.

## Local verification (2026-11-05)

- 99 targeted tests passed across 15 files: status polling and isolation, authentication, job completion and delivery, translation bootstrap and language switching, cache policies, analytics delivery and retry.
- Six outbox tests ran actual SQL in an isolated PGlite PostgreSQL runtime. They covered immutable retries, replay after acknowledgement failure, deduplication, cleanup, account purge and batching. PGlite serializes local requests; this does not establish real multi-connection PostgreSQL contention performance.
- 205 unique analytics events require three inserts and three acknowledgements, versus 410 individual statements previously. Single-event calls still require two statements.
- Type checking and the production build passed. The build used a separate local output directory to preserve the running editor.
- HTTP checks against the local production server: Spanish about HTML 22,446 bytes; French 22,875; English 22,195. Complete scripts execute before Next hydration. Spanish catalog 217,627 bytes and French 237,504 bytes are delivered separately with `public, max-age=31536000, immutable`, and no Set-Cookie. English makes no external catalog request.
- Catalog hashes and bootstrap content were checked for all ten languages. Existing translation and private-page cache tests passed.

## Limits

This saves repeated catalog transfer after caching and database round trips for batches. It does not eliminate Vercel function invocations for status polls; sharing benefits only overlapping reads in the same process. First-time localized visitors still download the full catalog, plus one static request. No honest overall CPU or bill reduction percentage can be inferred from these local tests.

A deployed preview should still receive browser smoke testing for hydration, locale switching and authenticated transcription completion. Production resource rates need comparison after deployment. No live analytics events, emails or customer database writes were used for verification.

The requested Graphify refresh was attempted, but the installed launcher references a missing Python script and did not update the graph.
