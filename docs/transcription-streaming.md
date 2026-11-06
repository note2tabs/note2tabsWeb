# Editable transcription streaming

Local implementation in both repositories on `feat/transcription-streaming`. Nothing pushed, merged or deployed. No schema migration or new Cloud Run service is required.

## Processing and editing

Both MuScriptor Small (Light) and Medium (Heavy) publish snapshots from the same inference event generator used for final MIDI serialization. No second inference is run. Preview failures cannot fail final inference.

One artifact per inference attempt is overwritten at most every eight seconds, plus completion. Existing status polling discovers revisions. The private artifact is capped at two megabytes; reaching the cap stops preview publication, not transcription. Only a descriptor is patched into the job record. This uses polling, not SSE.

A browser worker builds unquantized provisional tracks. Completed four-bar chunks run the existing fingering/playing-coordinate optimizer, with cached unchanged chunks. The progress watermark determines when a chunk is settled. The unfinished tail remains visible and editable. Instrument mapping and key estimation reuse the import models; early key estimates are provisional.

The existing Canvas, Sheets, MIDI and drum editors operate locally during streaming. User changes are recorded as a field-level journal in seconds, independently of new inference snapshots. Incoming data does not enter undo history. Local storage preserves the journal across refreshes; storage failure is surfaced. Preview edits cause no incremental server note writes. Practice and piano roll share the preview playback clock.

## Final import and parity

Completion runs the ordinary importer on the complete raw result. Both paths call the same canonical processing function. With no user edits, the journal is an exact bypass: preview fingerings and snapshots never become final input.

For edited imports, the journal overlays only changed fields onto the canonical baseline. Timing edits are quantized at completion. Preferred BPM uses the current edited rhythmic content; rebar occurs after canonical fingering so a changed tempo preference does not itself alter untouched fingerings. Key is reconsidered for musical-content edits. An append preserves the existing arrangement tempo/key.

Tests cover edited pitches/timing, additions/deletions, undo, retry epochs, equal-pitch swaps, reassigned IDs, notes/chords regrouped by quantization, and unrelated tracks. Coincident duplicate pitches and ambiguous source-to-final regrouping still need real-song testing; synthetic parity tests cannot prove every possible edited passage. Final commit briefly locks editing to capture one consistent journal.

## Safe dev test setup (read-only inspection, 2026-11-06)

Existing services in `note2tabs-backend`, europe-west1:

- `note2tabs-api-dev`
- `note2tabs-worker-service-dev` (preparation)
- `note2tabs-msmodel-small-service-dev-tasks` (free Light)
- `note2tabs-msmodel-small-subscribed-service-dev` (paid Light)
- `note2tabs-muscriptor-service-dev` (Heavy)
- `note2tabs-muscriptor-preview-service-dev` (Heavy preview)

The dev API routes current models through dev queues/topics and dev workers. However, inspected dev services use `DATABASE_URL:latest`, production API uses `DATABASE_URL:1`, and Secret Manager currently has only enabled version 1. They therefore share database credentials. A dev service name alone does not isolate production data.

Before real testing, point the frontend preview, dev API, preparation worker and inference workers at the same isolated Neon branch using a separate secret. Preserve dev queue/topic routing. Disable customer email/production callbacks in the test environment. Existing deployment scripts hardcode the shared database secret; do not run them blindly.

Deploy updated API and Small/Medium images to the relevant existing dev services. Updating only the API cannot test worker event publishing. Preparation needs no streaming-code rebuild, but its database/routing configuration must be isolated too. Legacy Spleeter/YourMT3 rebuilds are unnecessary for these two models. Keep production traffic/images unchanged.

Use a dedicated test account and short uploaded audio first. Test both Light and Heavy, several revisions, edits before later chunks, undo, completion, save/reopen, seeking/speed, retry and refresh. Compare unedited final imports against ordinary imports from identical raw output. GPU min instances can remain zero; real test inference and temporary idle retention still cost money.

## Rollback

`TRANSCRIPTION_STREAMING_ENABLED=false` on inference workers disables preview capture while keeping ordinary final import. Old frontends ignore descriptors; new frontend with old workers opens the final result normally. Preview artifacts use existing authenticated storage/lifecycle cleanup.

## Local verification

TypeScript and the current production build pass. Automated coverage includes both inference adapters preserving original events, throttling, storage failure, stale attempts, metadata patching, private artifact authentication/bounds, instrument mapping, chunk caching, preview playback, editing, and ordinary-versus-streamed import parity across piano/guitar/bass/drums and multiple tempos/meters. No real inference or authenticated browser end-to-end deployment was run.

`graphify update .` was attempted in both repositories; its installed launcher references a missing Python entry file. The global installation was left unchanged.
