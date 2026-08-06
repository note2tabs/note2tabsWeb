ALTER TABLE "canvas_lanes"
ADD COLUMN IF NOT EXISTS "track_type" TEXT NOT NULL DEFAULT 'tab';

CREATE INDEX IF NOT EXISTS "idx_canvas_lanes_track_type"
ON "canvas_lanes" ("user_id", "canvas_id", "track_type");
