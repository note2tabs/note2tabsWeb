CREATE TABLE "canvas_archives" (
    "user_id" TEXT NOT NULL,
    "canvas_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "object_key" TEXT,
    "object_generation" TEXT,
    "format_version" INTEGER NOT NULL DEFAULT 1,
    "sha256" TEXT,
    "raw_bytes" BIGINT,
    "compressed_bytes" BIGINT,
    "archived_at" TIMESTAMPTZ(6),
    "restored_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "note_count" INTEGER NOT NULL DEFAULT 0,
    "chord_count" INTEGER NOT NULL DEFAULT 0,
    "lane_count" INTEGER NOT NULL DEFAULT 0,
    "preview_notes" JSONB NOT NULL DEFAULT '[]'::jsonb,

    CONSTRAINT "canvas_archives_pkey" PRIMARY KEY ("user_id", "canvas_id")
);

CREATE INDEX "idx_canvas_archives_status"
ON "canvas_archives"("status", "archived_at");
