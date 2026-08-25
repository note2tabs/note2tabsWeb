-- Preserve drum-voice identity in normalized note rows.
ALTER TABLE "lane_notes"
ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Draft concurrency lives beside the normalized canvas, not in a duplicate
-- JSON document.
ALTER TABLE "canvases"
ADD COLUMN IF NOT EXISTS "draft_revision" INTEGER NOT NULL DEFAULT 0;

-- The guarded backend backfill must empty both JSON stores before this
-- destructive schema step is allowed to run.
DO $$
DECLARE
  has_rows BOOLEAN;
BEGIN
  IF to_regclass('editor_snapshots') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "editor_snapshots" LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'editor_snapshots still contains data; run scripts/migrate_editor_snapshots_to_relational.py --apply first';
    END IF;
  END IF;
  IF to_regclass('canvas_drafts') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "canvas_drafts" LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'canvas_drafts still contains data; run scripts/migrate_editor_snapshots_to_relational.py --apply first';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "canvas_drafts";
DROP TABLE IF EXISTS "editor_snapshots";
