# Chunk recovery destination fix

A controlled missing-module reproduction exposed a recovery bug: Next route-change errors include the requested URL, but recovery always called `location.reload()`. When the router has not changed browser history yet, this reloads the previous page instead of opening the destination.

The fix performs a guarded full navigation to a different same-origin destination, preserving its query/hash (including auth return paths) and language prefix. Same-page failures still reload. External/invalid destinations fall back to the guarded current-page reload. Storage failure and the existing five-minute guard still prevent reload loops. No alert/error suppression changed.

Browser reproduction used the real recovery module, a deliberately 404ing dynamic module, and a router-error callback carrying `/auth/login?next=%2Ftranscribe#signin`. Before the fix, recovery returned to `/`. Afterward, it reached the login destination with the return path/hash intact. This was a local browser harness, not a reproduction of the original customer's network conditions.

The October 26 Safari incident does not prove this was its cause: its URL was already the login page, and the user recovered, signed up, transcribed and reached the editor. The initial resource failure could still have been network/cache/deployment related; the recorded diagnostics do not establish which.

Validation: 16 focused recovery/outcome tests; TypeScript; production build; controlled browser before/after reproduction. No production test events or customer-account mutations.
