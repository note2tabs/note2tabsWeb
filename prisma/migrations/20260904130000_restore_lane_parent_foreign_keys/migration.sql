-- Match the Prisma relations: each child row belongs to a specific lane.
ALTER TABLE "lane_notes" DROP CONSTRAINT IF EXISTS "lane_notes_canvas_id_fkey";
ALTER TABLE "lane_chords" DROP CONSTRAINT IF EXISTS "lane_chords_canvas_id_fkey";
ALTER TABLE "lane_cuts" DROP CONSTRAINT IF EXISTS "lane_cuts_canvas_id_fkey";
ALTER TABLE "lane_note_effects" DROP CONSTRAINT IF EXISTS "lane_note_effects_canvas_id_fkey";

ALTER TABLE "lane_notes" ADD CONSTRAINT "lane_notes_canvas_id_lane_id_fkey"
  FOREIGN KEY ("canvas_id", "lane_id") REFERENCES "canvas_lanes" ("canvas_id", "lane_id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "lane_chords" ADD CONSTRAINT "lane_chords_canvas_id_lane_id_fkey"
  FOREIGN KEY ("canvas_id", "lane_id") REFERENCES "canvas_lanes" ("canvas_id", "lane_id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "lane_cuts" ADD CONSTRAINT "lane_cuts_canvas_id_lane_id_fkey"
  FOREIGN KEY ("canvas_id", "lane_id") REFERENCES "canvas_lanes" ("canvas_id", "lane_id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "lane_note_effects" ADD CONSTRAINT "lane_note_effects_canvas_id_lane_id_fkey"
  FOREIGN KEY ("canvas_id", "lane_id") REFERENCES "canvas_lanes" ("canvas_id", "lane_id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
