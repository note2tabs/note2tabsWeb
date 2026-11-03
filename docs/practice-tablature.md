# Practice tablature display

`GtePracticeTab` replaces only the guitar/bass tablature branch in the existing
Practice workspace. Canvas, editable Tab View, drums, pitched notation, transport,
audio scheduling, storage and musical models are unchanged. It consumes existing
`note.tab` and `chord.currentTabs`; it does not generate fingerings or quantize.

## Geometry

`buildPracticeTabLayout` in `lib/gtePracticeTabLayout.ts` flattens stored tabs into
read-only fret placements. Equal **original** onset timestamps share one column.
Conservative tabular-numeral label boxes establish a minimum 6px gap, with a
track-wide rhythmic spacing vocabulary, so equal patterns retain equal column
distances across one- and two-digit frets. Natural measure widths depend on note density and
label widths. Balanced line breaking uses the measured container width; sparse
final rows are not fully stretched. A measure too wide for one system continues
on another system, marked with a continuation arrow/dashed edge. Font size remains
16px; no whole-system horizontal scaling is used. Systems use 16px string spacing,
a 20px lower margin (36px when chord overlays need room). The blank space between
systems is about 29% smaller than the initial renderer, and the final margin is
trimmed. Extra row width is distributed between timestamp anchors by rhythmic
duration, capped at 16% for dense measures and 10px for sparse ones; collapsed
empty ranges never stretch. The central tablature card has content-driven height.
Line breaking
prioritizes fitting multiple measures per system before balancing whitespace.
Empty bar ranges collapse while
sustained-note bars remain present. Focused practice ranges, bar selection,
shift-selection, play-from-note, effects, optional chord overlay diagrams and
existing rating colors are retained.
Collapsed ranges show an explicit count, such as “5 empty bars”, with the original
bar range in the tooltip and accessible label; selecting them still selects the
full underlying range.

## Playback

Each measure fragment stores timestamp-to-x anchors. A binary lookup chooses the
fragment and interpolates between neighbouring anchors. Time is not reconstructed
from pixel spacing. The component reads the existing transport frame getter, so
seeking, looping and speed changes require no separate clock or audio pipeline.

Static geometry is memoized by notes/chords, tuning, bar size, track length, width
and focus range. A requestAnimationFrame loop updates only the cursor transform,
active-measure opacity and changed fret attributes. Sorted start/release edges
avoid scanning or rerendering all notes on forward playback; backward seeks
restore the active set. Geometry changes and unmounts cancel the previous loop.
System following uses smooth scrolling once per system transition, accounts for
the actual sticky banner/transport, respects reduced motion and supports the
fullscreen scrolling container.

## Verification

Layout tests cover 320/375/768/1200px widths, dense alternating 12/14 frets, chord
alignment, preservation of every source placement, non-linear timestamp mapping,
cross-bar holds, collapsed empty ranges and focus. React/SVG integration exercises
the shared frame getter, active-note transitions, interpolation, backward seeks,
row following, selection/play callbacks, resizing, track changes and RAF cleanup.

To generate synthetic desktop/mobile PNG previews while running the integration
test, set `PRACTICE_TAB_PREVIEW_DIR` to an existing temporary directory.

These fixtures are not the user's saved Toto Africa project. That project's
authenticated playback and visual review must be verified in the live browser;
synthetic tests and raster previews do not establish that end-to-end result.
