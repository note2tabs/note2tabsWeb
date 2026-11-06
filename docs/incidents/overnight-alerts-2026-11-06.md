# Overnight alerts — 2026-11-06

Reviewed events since the Nov5 playback activation release (21:33 UTC), including backend logs and subsequent user activity. No alerts were suppressed and no customer records were modified.

## Confirmed editor errors

- Brazil, 03:39:45 UTC: POST commit returned500. Backend traceback: `_db_get_canvas_owner` raised psycopg OperationalError because an idle connection had closed. User saved again at03:40:06.737 UTC.
- Korea, 08:19:44 UTC: POST commit returned500. Backend traceback: `restore_if_archived` called `ALTER TABLE canvas_archives ADD COLUMN IF NOT EXISTS name TEXT` during snapshot loading, causing a PostgreSQL deadlock under concurrent access. User saved again at08:19:53.935 UTC.
- Poland,07:58:39 UTC: TypeError reading startsWith from undefined. The production chunk at line1,column252293 maps to `event.key.startsWith("Arrow")` in GteWorkspace's keydown listener. Reproduced with a keydown event lacking a key string. Ignore invalid/empty keys before shortcut handling. The origin of that event is unconfirmed.

Backend fixes are in a separate PR: initialization already creates archive schema and marks the DB ready after commit; remove repeated runtime DDL. Retry only the read-only owner lookup once on a new connection after OperationalError. No automatic retries of editor writes and no extra normal-path queries.

## Other signals and limits

- Brazil,23:57–23:58 UTC Nov5: three presign400 responses with file_size_bytes=0. Server correctly rejected empty input; no transcription was accepted. This is not a subscription file-size limit.
- US,01:09 UTC: import failed after242.304s. Import requests and timing update succeeded, then user navigated to/transcribe and the final snapshot write failed with a network error alongside unrelated API requests. Job13b5dbda-0498-43f8-926f-68acd5e86024 still has no linked editor. Delivery is unresolved; do not describe this as recovered or claim the prior final-confirmation retry covers snapshot failures.
- Indonesia,05:43 UTC: client lost the transcription response, but the server accepted and completed the job. A later403 followed the unverified-account allowance; the user subsequently verified their email, completed another transcription and has a linked editor. The first completed job remains unlinked.
- Other isolated network failures have no confirmed application cause.

Audio activation breadcrumbs in the inspected sessions reported running/ready, and no new editor_play frustration event appeared in this window. This does not prove that every playback issue is resolved.

Validation: the keyless-event regression failed before the guard and passes afterward; existing coordinate shortcuts pass. Backend regression tests failed on unchanged main for runtimeDDL and stale owner lookup, then passed with the fixes. Frontend TypeScript and production webpack build passed. No deployment performed for these fixes.
