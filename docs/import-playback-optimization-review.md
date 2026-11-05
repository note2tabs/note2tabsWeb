# Import, playback and editor optimization review

Branch: `perf/import-playback-and-editor-work`. Website repository only; no backend source, migration, deployment, real email or customer-data changes.

## Implemented changes

1. **Completion response:** after durable result persistence and acknowledgement, schedule the completion notice using Vercel `waitUntil`. Keep the existing email claim/deduplication and durable jobs-based result-delivery scheduler. A test leaves the email promise unresolved and verifies the successful job response still finishes, with the background promise registered. Existing scheduler tests cover failed-email retries. This removes email latency from the browser's critical path; background processing still consumes resources.

2. **Import pipeline:** skip the timing PATCH only when the computed map exactly matches the current map. For newly created imports, remove bootstrap/placeholder tracks in the already-required final snapshot, rather than issuing a separate DELETE/save/reload per track. Existing-target imports preserve their other tracks. Keep sequential chunk limits, rhythm alignment, quantization, both fingering passes, overlap cleanup, voice assignment, and linking only after the final save. This reduces redundant post-import round trips; it does not eliminate expensive backend work for each import chunk or guarantee removal of the observed 30?40 second tail.

3. **Instrument preparation:** auditions and playback pass their required MIDI pitches into preparation. Choose the exact same nearest recorded sample as full-bank playback, including lower-pitch tie breaking. Decode only those samples. Reuse downloads across contexts and decoded buffers within each context; bound prepared subset combinations. Evict failed download/decode/preparation promises so a later attempt can recover. Bank warm-up uses at most four concurrent requests per call, and instrument changes warm the track's note pitches. A single-pitch cold preparation can use one sample instead of the entire acoustic (17), upright-piano (38), or grand-piano (30) bank. Actual song savings depend on its pitch range and browser cache.

4. **Incremental alternate fingerings:** retain dependency fingerprints and derived coordinates per workspace. Unchanged musical inputs reuse their results. Note edits invalidate the changed note and notes overlapping its old/new span. Tuning, fret limits, cut regions, chords and connected-effect changes receive conservative invalidation. Bulk edits fall back to full dependency checking. Cache entries retain copied coordinates, not musical snapshots; deletion and undo remain supported. Full JSON snapshot comparison and undo storage remain unchanged.

5. **Engagement writes:** insert up to 100 structured signals per SQL statement, preserving IDs, timestamps, account ownership, consent gates and `ON CONFLICT DO NOTHING`. Retry-safe batches replace one statement per event within a transaction. No new events or writes are introduced. Resource savings apply only with engagement signal collection enabled.

## Measurements and verification

- Isolated PostgreSQL/PGlite test using the actual engagement migration: 205 events require three inserts instead of 205. Duplicate retries preserve first payload, account ownership and SQL timestamps.
- A fixture with a stable timing map imports and saves with two requests (import and final snapshot), without a timing PATCH. Placeholder deletion is covered by checking the actual final save payload. Partial import failures remain unlinked.
- Sample tests verify exact nearest-sample equivalence, reuse across pitch subsets and contexts, and recovery from download and decoding failures.
- Differential fingering tests cover voice edits, pitch, timing/overlap, tuning, capo, fret range, cuts, chord occupancy, connected effects, deletion and undo. A deterministic sequence of 100 overlapping edits matches full recomputation.
- Optional benchmark: `N2T_BENCHMARK=1 npx vitest run tests/unit/gteIncrementalOptimals.test.ts`. On this machine, a 5,000-note voice-only edit measured median 8.3 ms for the original uncached derivation versus 4.7 ms cached across seven runs (about 44% less). These are synthetic local results, not whole-editor or Vercel CPU savings; initial derivation and broad musical changes still require work.
- Final validation: 188 tests passed across 28 files; one optional timing benchmark is skipped in the normal suite and was run separately. Standalone type checking and the isolated production build passed. No production inference, live email delivery or customer database writes were used.

## Before production

A preview should still receive browser checks for guitar/piano audition and playback after switching instruments, guest and signed-in transcription import, placeholder removal, and editing/undo with overlapping notes. Verify live completion-email delivery using a controlled account. Actual end-to-end import latency and Vercel/Neon resource rates require deployed measurements; no overall percentage is promised.

The Graphify refresh was attempted; the installed launcher references a missing Python script.
