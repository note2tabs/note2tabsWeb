# Core Web Vitals investigation — 16 October 2026

Blogs remain deferred at the owner's request.

## Field baseline

Search Console, updated 14 October: 275 URLs need improvement on both mobile and desktop. Mobile has INP 268 ms and LCP 3.1 s in the origin group represented by the homepage. Desktop has an LCP issue. Neither device currently has affected CLS URLs. Previous validation attempts failed. These grouped rolling field measurements must not be confused with a single-page lab test.

A cold production-homepage trace on mobile/Fast 4G/4× CPU reports LCP 1,052 ms, CLS 0, with CrUX URL-level p75 LCP 2,003 ms and INP 229 ms. Thus URL and Search Console group populations differ. The largest public shared script is 2,021,099 decoded bytes and 495,359 transferred bytes. All ten public translation JSON files are statically imported by the shared translator.

## Change

Keep all catalogs available on the server. Embed only the document's language as escaped inert JSON before hydration, and dynamically import other languages when needed. English only needs non-identity overrides. Preserve flow/editor overrides and invalidate rendered-message caches when registering a catalog. Deduplicate downloads, allow retry after failure, and preload catalog messages before a selector changes the saved preference. Client navigation can recover through a full server-rendered page if a catalog chunk fails.

Translated content remains present in the initial HTML. Locale, direction, canonical URLs and translation text are unchanged.

## Matched local production builds

Both builds use Next 16.2.12/Webpack; mobile 390×844, DPR 2, Fast 4G, 4× CPU, new isolated browser contexts. Baseline is the previous SEO worktree; candidate is this branch. Local public-count fixtures do not access customer data. Homepage build-time database counts are unavailable locally, so trust totals are absent in both compared English pages.

| Measurement | Before | After |
| --- | ---: | ---: |
| Initial homepage JS, decoded | 2,653,753 bytes | 642,068 bytes |
| Initial homepage JS, gzip | 794,314 bytes | 194,438 bytes |
| DOMContentLoaded | 1,499 ms | 907 ms |
| Largest buffered startup long task | 177 ms | 66 ms |
| LCP | 730 ms | 740 ms |
| CLS | 0 | 0 |
| YouTube-mode click | 128 ms | 128 ms |

Bundle numbers precede a small selector-recovery refinement; verify deployed bundle sizes separately. About 76% less initial JavaScript and a smaller startup blocking task are demonstrated. The test does **not** demonstrate an LCP or post-load interaction improvement, reproduce every field interaction, or prove the field report will pass.

## Verification

- 1,396 tests passed across 193 files, including full catalog loading, preservation of editor overrides, one-language bootstrap, server availability and English overrides.
- Production Webpack build passed TypeScript and compilation. Expected public trust-count fallback was used without a local database.
- All ten pricing pages returned correct server-rendered language, translated headings, one-language JSON payload and canonical URL.
- Browser settings switched between all ten languages without console errors; Arabic changed the document to RTL.
- New initial browser script lists do not contain the ten public catalogs.

## Release follow-up

Check the production bundler and public language flows before starting Search Console validation. Record the release and validation outcome separately. Validation is an observation period, not an instant declaration that all real-user metrics pass.

Additional recovery check: offline French-to-English selector download kept the page in French and left the explicit preference unset; restoring connectivity and retrying switched to English successfully.
