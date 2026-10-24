# Drum tempo scaling persistence fix — 24 October 2026

## Reproduction

Using an independent copy of the affected multi-instrument project, press the global BPM ×2 or ×0.5 control. The outgoing canvas contains scaled note frames and changed timing-map metadata, but unchanged per-lane versions. Fetching the canvas again shows the new tempo with the old drum and bass frames. Piano notation assignments do update and the frontend restores their timing from that metadata, masking the skipped child-row write for piano.

The backend's `_db_upsert_canvas_snapshot` updates lane metadata on every save but rebuilds note/chord child rows only when the lane version changes. `scaleImportedLane`, used for global rhythmic reframing and import rhythm scaling, changed the notes without changing that version.

## Fix

Advance the version of each scaled lane and synchronize its FPS with the new bar duration. Keep notes, chords/strums, offsets, cuts, rests and drum loops on the same scale. A no-op scale leaves the original object/version unchanged. No backend change or migration is needed.

## Verification

- New regression cases for both ×2 and ×0.5 fail on the original helper and pass with the fix. They model the backend's version-gated child-row persistence and compare saved note positions and seconds across piano, bass and drums, including drum loops.
- Eight timing/import/drum/playback/guest suites passed:47 tests.
- On a production test copy, the old UI changed tempo/notation metadata while drum/bass rows stayed unchanged. Advancing scaled lane versions in the outgoing test request made the live database retain the scaled drum/bass positions too. The original project was not modified.
- This prevents future lost tempo edits. Already-stored mismatched frames must not be automatically rescaled from the current BPM alone: the sequence of prior scaling actions and later manual edits is needed for a safe repair.
