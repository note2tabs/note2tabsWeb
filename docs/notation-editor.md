# Notation editor architecture

## Why the original rendering failed

The former renderer used fixed-width measures and proportional timestamp-to-x
coordinates. Individual SVG symbols had no shared engraving metrics. Independent
duration approximation and staff-wide silence detection could not represent
polyphonic voices, rhythmic grouping, or voice-specific rests. The renderer also
did not consume the song key signature.

## Current pipeline

1. `gteNotation.ts` adapts stored notes/chords and performs explicit edits.
   Original MIDI pitch, timing, duration and velocity remain authoritative.
2. `gteNotationScore.ts` builds a separate display score: quantized rhythm,
   equal-duration chords, independent interval-partitioned voices, voice rests,
   conventional values, dots, ties, meter groups and detected triplets.
   Display quantization never writes back to the performance snapshot.
3. `gteNotationEngraving.ts` uses bundled VexFlow/Bravura symbol metrics and its
   formatter, note/rest/accidental collision rules, beams, tuplets and ties.
   Measured minimum widths determine system packing; sparse measures have a
   bounded expansion budget. Both staves share the time formatter.
4. `GteEngravedScore.tsx` renders the score and a separate interaction overlay.
   Hit targets use actual notehead positions, including displaced chord seconds.
   Piecewise time mapping connects engraving to insertion and playback. Selection,
   hover and playback updates do not rebuild the engraving.
5. `GteNotationWorkspace.tsx` owns input modes, keyboard commands, audition and
   existing snapshot/undo callbacks. Reading/practice views omit editing aids.

## Tests and review

Unit tests cover non-mutating interpretation, voice completion and silence,
chords, compound/simple meters, dots, triplets, bar ties, key spelling and tiny
floating-point bar overruns. Real-font native Canvas tests exercise VexFlow
layout/drawing and aligned staves, dense/sparse sizing and displaced heads.
A React/JSDOM integration test renders real SVG and checks selection and stable
engraving during playback updates. Controller tests cover entry, edit, drag,
undo callbacks and read-only modes.

Set `GTE_NOTATION_RENDER_DIR` when running `gteNotationEngraving.test.ts` to save
the rendered regression examples as PNG files.

Browser review is still required for actual pointer placement/dragging, audio,
save/reopen, narrow windows and representative imported songs. DOM/native Canvas
tests are not proof of these integrations or human-approved engraving quality.

## Deliberate limits

Automatic voice assignment is deterministic interval partitioning, not semantic
music analysis. Tuplet inference currently recognizes complete three-note
patterns, not arbitrary or nested tuplets. Cross-staff beams and manual voice
assignment are not implemented. Extremely dense measures retain legible minimum
width and may scroll horizontally. These limits should not be presented as full
MuseScore/Guitar Pro equivalence.
