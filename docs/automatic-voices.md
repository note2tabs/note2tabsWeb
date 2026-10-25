# Automatic notation voices

`assignVoices` (`lib/gteAssignVoices.ts`) is the shared editor entry point.
It runs after import timing/cleanup, fills missing assignments on Sheets entry,
and powers **Tools → Auto Assign Voices**. It operates on the existing model;
it changes voice metadata only, never pitches, performance timing or chord objects.
Drums retain their separate percussion voice rules.

## Classification

`assignNoteVoices` is independent of React, playback and network access. Its inputs
use the same integer tick quantizer as Sheets (including recognized triplets).
Notes are ordered by onset, pitch and stable ID. Candidates include single-voice
assignments, adjacent-pitch splits, reversed splits for crossing lines and
duration-layer splits. Candidate generation defaults to 16 alternatives; global
beam search retains 64 states, deduplicating equivalent sounding/line states.
Search processes the complete track, with active note releases and recent pitch,
duration and onset spacing retained across bar boundaries. Clean monophonic or
equal-duration block-chord sequences spanning at most an octave take a linear single-voice fast path unless
recurring bass motion under a moving melody provides independent-line evidence.
Repeated separated chordal registers also bypass this shortcut: at least three
nearby events must support a similar register boundary with multiple tones on
each side. This lets synchronized accompaniment and upper chords form two voices
without relying on a single register gap alone. This is contextual evidence, not a
fixed middle-C cutoff or automatic assignment based on staff.

Exported scoring helpers normalize pitch jumps, rhythmic changes, overlap,
crossing, switching, chord splits and second-voice usage. Weights and search
bounds are configurable. Second-voice activation carries an extra complexity
cost so ordinary chords do not split merely to avoid a melodic jump. Conflicting
same-voice rhythmic overlaps receive the strongest penalty. Crossing is soft.
Simultaneously sounding spans beyond an octave receive a quadratic penalty,
including held notes from earlier attacks; wide chords cannot use the shortcut.
An octave is a soft reach target, not a guarantee for every player's hand size.

Staff allocation is separate from voice assignment. `gteNotationHands.ts`
evaluates ordered left/right partitions at each onset, considering held pitches,
octave reach, register and previous hand centers. Explicit note staff choices
remain fixed. Automatic placement can cross middle C without altering notes.
This is a deterministic greedy hand allocator, not a fingering solver or a
guaranteed globally optimal arrangement. Spans that cannot fit within two
octave-wide groups produce a voice-assignment warning rather than pitch changes.

## State and user choices

`notationVoiceSource` distinguishes automatic, imported and manual assignments;
`notationVoiceLocked` preserves manual locks. Choosing a voice explicitly in
Sheets or MIDI marks it manual/locked. Missing metadata is not defaulted to a
persisted Voice 1. Older explicit assignments remain conservative on open;
the manual tool confirms replacement of existing choices before recalculating.
Automatic import/view assignment preserves imported/manual choices and locks.
The explicit Tools action replaces all assignments in its scope, including
manual, imported and locked choices, after confirmation. Selected chord members
can have independent voice metadata without disbanding the chord. Unselected
notes provide fixed context and are never changed by a scoped operation.

The existing snapshot history and save queue handle undo/redo and persistence.
The legacy backend's JSON metadata field carries voice provenance, locks and
member assignments, alongside existing notation data. There is no new database
table, API endpoint or high-frequency write. Ordinary view changes and unrelated
edits return the same track without recomputation or a save.

MusicXML voice identifiers are mapped per staff by first appearance, not assumed
to be `1` and `2`. Notes, simultaneous onsets, staves, rests and ties are retained.
Parts exceeding two voices keep every note and show a compatibility warning.
Notation MusicXML export uses the same score representation as Sheets, including
separate voices and cross-bar ties. Native JSON remains the lossless project
format. MIDI has no standard notation voice field, so its voices are inferred
on import rather than encoded as a nonstandard MIDI channel convention.

## Engraving and limitations

Sheets maps assigned voices directly to stem directions: Voice 1 stems up and
Voice 2 stems down, even where the other voice is empty. This deliberately makes
voice changes visible and consistent with the toolbar, including bulk edits and
legacy assignments without provenance. Each voice retains its
independent rests, beams and ties. Empty secondary voices remain hidden.

This is a bounded heuristic, not semantic understanding of a composition.
Homorhythmic independent lines can be indistinguishable from a chord sequence;
ambiguous clean passages deliberately favor one voice. Dense music requiring
three or more rhythmic layers receives a two-voice approximation and warning,
not note deletion. Manual choices resolve ambiguous passages. A scope uses the
full track as context; it does not reset classification at each measure.

Tests cover synthetic melody/chords, independent rhythms, sustained bass,
crossings with locked context, determinism, data preservation, dense passages,
Sheets mounting, selection scope, snapshot history, serialization and real import
adapters with mocked HTTP persistence. These are not live transcriber/backend or
human visual-approval tests.

Local Windows/Node benchmark (64-state beam, 16-candidate limit): 1,536 notes in
1,123 ms; 3,072 notes in 1,998 ms. Both retained every note. The fixture has six
pitches per attack, held lower notes and moving upper attacks; clean melody/chord
tracks use the cheaper fast path. These are local CPU timings, not browser FPS
or a guarantee for every device. Extremely long/dense sustained passages can
still block briefly during explicit recomputation; a worker is a future option.
