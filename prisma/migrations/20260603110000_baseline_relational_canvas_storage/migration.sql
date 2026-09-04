-- These tables predate their Prisma migrations and were historically created
-- by the backend. Define the legacy shape so fresh databases can replay the
-- migration history; existing databases treat these statements as no-ops.
CREATE TABLE IF NOT EXISTS "canvases" (
  "user_id" TEXT NOT NULL, "canvas_id" TEXT NOT NULL, "name" TEXT,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "canvas_schema_version" INTEGER NOT NULL DEFAULT 1,
  "seconds_per_bar" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "timing_version" INTEGER NOT NULL DEFAULT 2,
  "timing_map" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "canvases_pkey" PRIMARY KEY ("user_id", "canvas_id")
);
CREATE INDEX IF NOT EXISTS "idx_canvases_user_updated" ON "canvases" ("user_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "canvas_lanes" (
  "user_id" TEXT NOT NULL, "canvas_id" TEXT NOT NULL, "lane_id" TEXT NOT NULL,
  "lane_index" INTEGER NOT NULL, "name" TEXT, "track_type" TEXT NOT NULL DEFAULT 'tab',
  "version" INTEGER NOT NULL DEFAULT 1, "time_signature" INTEGER NOT NULL DEFAULT 8,
  "time_signature_bottom" INTEGER NOT NULL DEFAULT 4,
  "frames_per_messure" INTEGER NOT NULL DEFAULT 480, "fps" INTEGER NOT NULL DEFAULT 240,
  "total_frames" INTEGER NOT NULL DEFAULT 480,
  "seconds_per_bar" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "canvas_lanes_pkey" PRIMARY KEY ("user_id", "canvas_id", "lane_id"),
  CONSTRAINT "canvas_lanes_user_id_canvas_id_fkey" FOREIGN KEY ("user_id", "canvas_id")
    REFERENCES "canvases" ("user_id", "canvas_id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_canvas_lanes_unique_order" ON "canvas_lanes" ("user_id", "canvas_id", "lane_index");
CREATE INDEX IF NOT EXISTS "idx_canvas_lanes_lookup" ON "canvas_lanes" ("user_id", "canvas_id", "lane_id");
CREATE INDEX IF NOT EXISTS "idx_canvas_lanes_track_type" ON "canvas_lanes" ("user_id", "canvas_id", "track_type");

CREATE TABLE IF NOT EXISTS "lane_notes" (
  "user_id" TEXT NOT NULL, "canvas_id" TEXT NOT NULL, "lane_id" TEXT NOT NULL,
  "note_id" INTEGER NOT NULL, "start_time" INTEGER NOT NULL, "length" SMALLINT NOT NULL,
  "midi_num" SMALLINT NOT NULL, "tab_string" SMALLINT NOT NULL, "tab_fret" SMALLINT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lane_notes_pkey" PRIMARY KEY ("user_id", "canvas_id", "lane_id", "note_id"),
  CONSTRAINT "lane_notes_user_id_canvas_id_lane_id_fkey" FOREIGN KEY ("user_id", "canvas_id", "lane_id")
    REFERENCES "canvas_lanes" ("user_id", "canvas_id", "lane_id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_lane_notes_lookup" ON "lane_notes" ("user_id", "canvas_id", "lane_id", "start_time", "note_id");

CREATE TABLE IF NOT EXISTS "lane_chords" (
  "user_id" TEXT NOT NULL, "canvas_id" TEXT NOT NULL, "lane_id" TEXT NOT NULL,
  "chord_id" INTEGER NOT NULL, "start_time" INTEGER NOT NULL, "length" SMALLINT NOT NULL,
  "original_midi" JSONB NOT NULL DEFAULT '[]'::jsonb, "current_tabs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "og_tabs" JSONB NOT NULL DEFAULT '[]'::jsonb, "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lane_chords_pkey" PRIMARY KEY ("user_id", "canvas_id", "lane_id", "chord_id"),
  CONSTRAINT "lane_chords_user_id_canvas_id_lane_id_fkey" FOREIGN KEY ("user_id", "canvas_id", "lane_id")
    REFERENCES "canvas_lanes" ("user_id", "canvas_id", "lane_id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_lane_chords_lookup" ON "lane_chords" ("user_id", "canvas_id", "lane_id", "start_time", "chord_id");

CREATE TABLE IF NOT EXISTS "lane_cuts" (
  "user_id" TEXT NOT NULL, "canvas_id" TEXT NOT NULL, "lane_id" TEXT NOT NULL,
  "region_index" INTEGER NOT NULL, "start_time" INTEGER NOT NULL, "end_time" INTEGER NOT NULL,
  "coord_string" SMALLINT NOT NULL, "coord_fret" SMALLINT NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lane_cuts_pkey" PRIMARY KEY ("user_id", "canvas_id", "lane_id", "region_index"),
  CONSTRAINT "lane_cuts_user_id_canvas_id_lane_id_fkey" FOREIGN KEY ("user_id", "canvas_id", "lane_id")
    REFERENCES "canvas_lanes" ("user_id", "canvas_id", "lane_id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_lane_cuts_lookup" ON "lane_cuts" ("user_id", "canvas_id", "lane_id", "region_index");

CREATE TABLE IF NOT EXISTS "lane_note_effects" (
  "user_id" TEXT NOT NULL, "canvas_id" TEXT NOT NULL, "lane_id" TEXT NOT NULL,
  "effect_id" INTEGER NOT NULL, "effect_type" INTEGER NOT NULL,
  "start_note_id" INTEGER NOT NULL, "end_note_id" INTEGER NOT NULL,
  "effect_label" TEXT NOT NULL DEFAULT '', "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lane_note_effects_pkey" PRIMARY KEY ("user_id", "canvas_id", "lane_id", "effect_id"),
  CONSTRAINT "lane_note_effects_user_id_canvas_id_lane_id_fkey" FOREIGN KEY ("user_id", "canvas_id", "lane_id")
    REFERENCES "canvas_lanes" ("user_id", "canvas_id", "lane_id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_lane_note_effects_lookup" ON "lane_note_effects" ("user_id", "canvas_id", "lane_id", "effect_id");
