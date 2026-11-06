# Editable transcription streaming

Local implementation in both repositories on `feat/transcription-streaming`. Nothing pushed, merged or deployed. No schema migration or new Cloud Run service is required.

## Processing and editing

Both MuScriptor Small (Light) and Medium (Heavy) publish snapshots from the same inference event generator used for final MIDI serialization. No second inference is run. Preview failures cannot fail final inference.

One artifact per inference attempt is overwritten at most every eight seconds, plus completion. Existing status polling discovers revisions. The private artifact is capped at two megabytes; reaching the cap stops preview publication, not transcription. Only a descriptor is patched into the job record. This uses polling, not SSE.

A browser worker starts from MuScriptor's preprocessing beat-grid BPM and keeps that tempo for the stream. It waits for valid preprocessing tempo instead of displaying notes at an invented BPM. Raw MIDI remains unchanged. Onsets/durations are quantized with the shared 1/16 quantizer before partitioning, so onset clusters and same-pitch overlaps see neighbouring bars. Completed one-bar chunks then run the existing fingering/playing-coordinate optimizer, with cached unchanged chunks. A small right-edge lookahead keeps boundary clusters together. The progress watermark determines when a chunk is settled. The unfinished tail waits for the next settled watermark. Completed events are revealed chronologically at bounded render intervals paced against the observed snapshot cadence, with simultaneous hits kept together. Reveals yield during editing gestures. Instrument mapping and key estimation reuse the import models; early key estimates are provisional.

The existing Canvas, Sheets, MIDI and drum editors operate locally during streaming. User changes are recorded as a field-level journal in seconds, independently of new inference snapshots. Incoming data does not enter undo history. Local storage preserves the journal across refreshes; storage failure is surfaced. Preview edits cause no incremental server note writes. Practice and piano roll share the preview playback clock.

## Live completion

Live new arrangements finish in the same mounted editor. The final raw source processes any remaining chunks through the same quantization/optimization path and fills the reveal queue. Completion only snapshots and saves the current edited score; it does not rewrite BPM, note timing, fingerings or voices. This live path intentionally does not apply the ordinary importer's preferred-eighth-note BPM rescaling. Existing append imports retain their original completion path.

Editing remains available during completion. A revision check discards stale snapshot results and captures the latest score. Saving reuses one editor ID and repeats the snapshot only when edits arrived during an in-flight save. Preview source updates do not create incremental database note writes.

Playback keeps its AudioContext and clock across source growth, updating its lookahead queue for newly available events. The normal speed, loop and mute controls retain their restart behavior. Automated tests cover paced reveal, simultaneous events, one-bar settling, live scheduling, edits during completion and adoption of the saved arrangement without navigation. Authenticated save/reopen and real inference still require dev end-to-end testing.

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

## Continuous-processing verification

Progressive prefixes (including duplicate revisions and the last partial bar) match a complete-raw-input call to the same canonical one-bar pipeline across piano/guitar/bass/drums, 4/4 and 3/4, and 71.5/93/120/176 BPM. Notation timing/pitches also match an independent whole-track call to the existing quantizer. Tests cover boundary onset clusters, locked preprocessing tempo, edited timing/pitches, deletion and completion without a second musical transform.

This equivalence is to running the current one-bar algorithm on all raw input at once. The historical whole-track fingering optimizer can use different cross-bar context; these tests do not establish identical fingerings to that older algorithm. No real model inference was run for this change. Backend inspection confirmed both streaming model adapters already provide the preprocessing beat grid before their note events; no backend changes or container rebuilds were needed.

## Streaming presentation

Until the first generated music is ready, the stream route reuses `JobStatusLayout`'s transcription progress screen, including current job timing; it does not use the editor skeleton. Initial track preference is guitar tab, bass tab, notation, then other tracks. Incoming source metadata never overrides an existing active track.

The editor progress panel occupies normal document space below the editor header, avoiding overlays over notes and controls. Its percentage follows the revealed musical-time frontier; a model snapshot arriving ahead does not immediately advance the displayed percentage. Empty settled sections can advance progress once their queued notes have all appeared. Completion stays below 100% until saving succeeds.
