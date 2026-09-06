-- GteTrackInstrument and GteDrumLoopState become per-editor instead of
-- per-user: an instrument/drum-loop choice is a property of the track
-- itself, shared by everyone with access to that editor (relevant now that
-- editors can be shared -- see canvas_shares), not a private preference.
--
-- Existing rows are keyed by (userId, editorId, laneId), so the SAME
-- (editorId, laneId) can already have multiple rows (one per user who ever
-- touched that lane) before this migration. Keep only the most recently
-- updated row per (editorId, laneId) before dropping userId, or the new
-- UNIQUE (editorId, laneId) constraint would fail on real data.

DELETE FROM "GteTrackInstrument" a
USING "GteTrackInstrument" b
WHERE a."editorId" = b."editorId"
  AND a."laneId" = b."laneId"
  AND (a."updatedAt", a."id") < (b."updatedAt", b."id");

ALTER TABLE "GteTrackInstrument" DROP CONSTRAINT IF EXISTS "GteTrackInstrument_userId_fkey";
DROP INDEX IF EXISTS "GteTrackInstrument_userId_editorId_laneId_key";
DROP INDEX IF EXISTS "GteTrackInstrument_userId_updatedAt_idx";
DROP INDEX IF EXISTS "GteTrackInstrument_editorId_laneId_idx";
ALTER TABLE "GteTrackInstrument" DROP COLUMN "userId";
CREATE UNIQUE INDEX "GteTrackInstrument_editorId_laneId_key"
    ON "GteTrackInstrument"("editorId", "laneId");

DELETE FROM "GteDrumLoopState" a
USING "GteDrumLoopState" b
WHERE a."editorId" = b."editorId"
  AND a."laneId" = b."laneId"
  AND (a."updatedAt", a."id") < (b."updatedAt", b."id");

ALTER TABLE "GteDrumLoopState" DROP CONSTRAINT IF EXISTS "GteDrumLoopState_userId_fkey";
DROP INDEX IF EXISTS "GteDrumLoopState_userId_editorId_laneId_key";
DROP INDEX IF EXISTS "GteDrumLoopState_userId_updatedAt_idx";
DROP INDEX IF EXISTS "GteDrumLoopState_editorId_laneId_idx";
ALTER TABLE "GteDrumLoopState" DROP COLUMN "userId";
CREATE UNIQUE INDEX "GteDrumLoopState_editorId_laneId_key"
    ON "GteDrumLoopState"("editorId", "laneId");
