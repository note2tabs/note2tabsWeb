-- Normalize canvas_lanes / lane_notes / lane_chords / lane_cuts / lane_note_effects
-- to key off canvas_id alone instead of the (user_id, canvas_id) composite.
--
-- PRECONDITION (must be true before running this against prod):
--   The only known (user_id, canvas_id) collision -- canvas_id
--   '9d7a55d2-009c-4a34-bc7a-f3b1c689abb9' existing under two different
--   user_ids -- has already been resolved (see Task 1). Re-run the collision
--   check below and abort if it returns any rows:
--
--     SELECT canvas_id, count(DISTINCT user_id)
--     FROM canvases
--     GROUP BY canvas_id
--     HAVING count(DISTINCT user_id) > 1;
--
-- DO NOT RUN THIS AGAINST PROD NEON WITHOUT EXPLICIT AUTHORIZATION.
-- This file was validated only against a local Docker postgres:16 container
-- (see Task 3 evidence). Constraint drop order matters: the 4 lane_* child
-- tables' FKs reference canvas_lanes_pkey, so those FKs must be dropped
-- before canvas_lanes' own primary key can be dropped.

BEGIN;

-- 1. canvases: add a true global unique constraint on canvas_id (kept in
--    addition to the existing composite primary key (user_id, canvas_id)).
ALTER TABLE canvases
  ADD CONSTRAINT canvases_canvas_id_key UNIQUE (canvas_id);

-- 2. Drop the 4 lane_* child tables' FKs into canvas_lanes FIRST (they
--    depend on canvas_lanes_pkey), then drop canvas_lanes' own PK/FK/indexes.
ALTER TABLE lane_notes        DROP CONSTRAINT IF EXISTS lane_notes_user_id_canvas_id_lane_id_fkey;
ALTER TABLE lane_chords       DROP CONSTRAINT IF EXISTS lane_chords_user_id_canvas_id_lane_id_fkey;
ALTER TABLE lane_cuts         DROP CONSTRAINT IF EXISTS lane_cuts_user_id_canvas_id_lane_id_fkey;
ALTER TABLE lane_note_effects DROP CONSTRAINT IF EXISTS lane_note_effects_user_id_canvas_id_lane_id_fkey;

ALTER TABLE lane_notes        DROP CONSTRAINT IF EXISTS lane_notes_pkey;
ALTER TABLE lane_chords       DROP CONSTRAINT IF EXISTS lane_chords_pkey;
ALTER TABLE lane_cuts         DROP CONSTRAINT IF EXISTS lane_cuts_pkey;
ALTER TABLE lane_note_effects DROP CONSTRAINT IF EXISTS lane_note_effects_pkey;

DROP INDEX IF EXISTS idx_lane_notes_lookup;
DROP INDEX IF EXISTS idx_lane_chords_lookup;
DROP INDEX IF EXISTS idx_lane_cuts_lookup;
DROP INDEX IF EXISTS idx_lane_note_effects_lookup;

-- 3. canvas_lanes: drop user_id, re-key on (canvas_id, lane_id), FK to
--    canvases(canvas_id) ON DELETE CASCADE.
ALTER TABLE canvas_lanes DROP CONSTRAINT IF EXISTS canvas_lanes_pkey;
ALTER TABLE canvas_lanes DROP CONSTRAINT IF EXISTS canvas_lanes_user_id_canvas_id_fkey;
DROP INDEX IF EXISTS idx_canvas_lanes_unique_order;
DROP INDEX IF EXISTS idx_canvas_lanes_lookup;
DROP INDEX IF EXISTS idx_canvas_lanes_track_type;

ALTER TABLE canvas_lanes DROP COLUMN user_id;

ALTER TABLE canvas_lanes
  ADD CONSTRAINT canvas_lanes_pkey PRIMARY KEY (canvas_id, lane_id);
ALTER TABLE canvas_lanes
  ADD CONSTRAINT canvas_lanes_canvas_id_fkey
    FOREIGN KEY (canvas_id) REFERENCES canvases (canvas_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX idx_canvas_lanes_unique_order ON canvas_lanes (canvas_id, lane_index);
CREATE INDEX idx_canvas_lanes_lookup ON canvas_lanes (canvas_id, lane_id);
CREATE INDEX idx_canvas_lanes_track_type ON canvas_lanes (canvas_id, track_type);

-- 4. lane_notes: drop user_id, re-key on (canvas_id, lane_id, note_id),
--    FK to canvases(canvas_id) ON DELETE CASCADE.
ALTER TABLE lane_notes DROP COLUMN user_id;

ALTER TABLE lane_notes
  ADD CONSTRAINT lane_notes_pkey PRIMARY KEY (canvas_id, lane_id, note_id);
ALTER TABLE lane_notes
  ADD CONSTRAINT lane_notes_canvas_id_fkey
    FOREIGN KEY (canvas_id) REFERENCES canvases (canvas_id) ON DELETE CASCADE;

CREATE INDEX idx_lane_notes_lookup ON lane_notes (canvas_id, lane_id, start_time, note_id);

-- 5. lane_chords
ALTER TABLE lane_chords DROP COLUMN user_id;

ALTER TABLE lane_chords
  ADD CONSTRAINT lane_chords_pkey PRIMARY KEY (canvas_id, lane_id, chord_id);
ALTER TABLE lane_chords
  ADD CONSTRAINT lane_chords_canvas_id_fkey
    FOREIGN KEY (canvas_id) REFERENCES canvases (canvas_id) ON DELETE CASCADE;

CREATE INDEX idx_lane_chords_lookup ON lane_chords (canvas_id, lane_id, start_time, chord_id);

-- 6. lane_cuts
ALTER TABLE lane_cuts DROP COLUMN user_id;

ALTER TABLE lane_cuts
  ADD CONSTRAINT lane_cuts_pkey PRIMARY KEY (canvas_id, lane_id, region_index);
ALTER TABLE lane_cuts
  ADD CONSTRAINT lane_cuts_canvas_id_fkey
    FOREIGN KEY (canvas_id) REFERENCES canvases (canvas_id) ON DELETE CASCADE;

CREATE INDEX idx_lane_cuts_lookup ON lane_cuts (canvas_id, lane_id, region_index);

-- 7. lane_note_effects
ALTER TABLE lane_note_effects DROP COLUMN user_id;

ALTER TABLE lane_note_effects
  ADD CONSTRAINT lane_note_effects_pkey PRIMARY KEY (canvas_id, lane_id, effect_id);
ALTER TABLE lane_note_effects
  ADD CONSTRAINT lane_note_effects_canvas_id_fkey
    FOREIGN KEY (canvas_id) REFERENCES canvases (canvas_id) ON DELETE CASCADE;

CREATE INDEX idx_lane_note_effects_lookup ON lane_note_effects (canvas_id, lane_id, effect_id);

-- NOTE: canvas_archives keeps its existing (user_id, canvas_id) composite
-- primary key unchanged -- it is metadata scoped to the ownership boundary,
-- not a child of canvas_lanes.

COMMIT;
