# Device language preference verification

The site serves a supported device language by default, with English as the fallback. The header offers English and that device language until the visitor explicitly chooses; it then disappears. A Language link in the footer opens Settings, including for signed-out visitors. Settings offers English, the supported device language, and the current language if different; it never lists all eight languages.

Explicit choices use a year-long cookie plus browser storage. Storage restores expired cookies and preserves older explicit selections. Automatically visiting a translated route does not lock a preference. Changes in Settings update navigation, account flow return URLs, and the shared `/gte` workspace without modifying project identifiers. Existing account data and account actions remain authenticated. Country-based prices remain independent from language.

## Evidence

- 977 tests pass across 173 files, including preference persistence, storage failures, migration, device-language pairs in all eight languages, editor language, guest account isolation, and analytics cohorts.
- TypeScript checks and the production webpack build pass. The default Turbopack build could not follow this worktree’s external `node_modules` symlink; webpack resolves it correctly.
- [Layout checks](layout-checks.json): all eight guest Settings pages at 390px and 1440px, with no horizontal overflow or clipped controls. Save buttons remain 34px tall.
- [Browser navigation checks](navigation-checks.json): one explicit English choice survives reloads and translated pricing, transcriber, editor landing, Settings, and `/gte` URLs; the quick switch remains hidden.
- Browser interaction also saved Simplified Chinese, verified native editor terminology, and changed the saved choice back to English using Settings.
- [Production HTTP checks](http-checks.json): seven device-language redirects, seven locked English redirects, seven native crawler responses retaining hreflang, seven editor SSR language selections, and signed-out Settings with noindex.
- [Desktop screenshot](settings-desktop.png) and [mobile Simplified Chinese screenshot](settings-mobile-zh-hans.png).

Browser checks used an English-configured browser; the other device languages are covered by preference tests and production Accept-Language checks. No external translation API was called.
