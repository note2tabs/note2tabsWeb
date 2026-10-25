export type InstrumentAudience = "piano" | "bass" | "drums" | "ukulele";
export type InstrumentGuide = {
  slug: string;
  title: string;
  excerpt: string;
  instrument: InstrumentAudience;
  goal: "transcribe" | "editor";
  mode?: "youtube";
};
export const instrumentGuides: InstrumentGuide[] = [
  { slug: "how-to-transcribe-piano-audio-to-sheet-music", title: "How to Transcribe Piano Audio to Sheet Music", excerpt: "Check melody, accompaniment and note lengths, then choose MIDI or MusicXML for your piano arrangement.", instrument: "piano", goal: "transcribe" },
  { slug: "how-to-edit-piano-midi-as-sheet-music", title: "How to Edit Piano MIDI as Sheet Music and Music Notation", excerpt: "Move between piano roll and notation to check rhythm, voicing and the placement of a piano part.", instrument: "piano", goal: "editor" },
  { slug: "how-to-write-piano-music-notation-online", title: "How to Write Piano Music Notation Online", excerpt: "Write a melody, add accompaniment and check your piano score with notation, piano roll and playback.", instrument: "piano", goal: "editor" },
  { slug: "piano-roll-vs-sheet-music-notation", title: "Piano Roll vs Sheet Music: When to Use Each View", excerpt: "Compare piano roll and staff notation for writing, checking note overlaps and practising an arrangement.", instrument: "piano", goal: "editor" },
  { slug: "how-to-transcribe-piano-from-youtube", title: "How to Transcribe Piano from YouTube", excerpt: "Choose a piano passage, generate editable notes and refine the music notation for practice.", instrument: "piano", goal: "transcribe", mode: "youtube" },
  { slug: "how-to-fix-a-piano-transcription", title: "How to Fix a Piano Transcription", excerpt: "Correct pitches, repeated attacks and note lengths, then check the bar structure and readability of the score.", instrument: "piano", goal: "editor" },
  { slug: "how-to-transcribe-drums-from-a-recording", title: "How to Transcribe Drums from a Recording", excerpt: "Check kick, snare, cymbals and fills in layers, then keep the groove editable for practice or production.", instrument: "drums", goal: "transcribe" },
  { slug: "how-to-read-drum-notation", title: "How to Read Drum Notation", excerpt: "Read kit voices, subdivisions and simultaneous hits, with a simple backbeat you can hear in the editor.", instrument: "drums", goal: "editor" },
  { slug: "how-to-write-drum-beats-and-fills", title: "How to Write Drum Beats and Fills", excerpt: "Build a groove in layers, write a fill that lands on the next bar and check the arrangement with playback.", instrument: "drums", goal: "editor" },
  { slug: "how-to-transcribe-a-bassline-from-a-recording", title: "How to Transcribe a Bassline from a Recording", excerpt: "Work out the bass notes, check the groove and choose playable fret positions on a four-string bass.", instrument: "bass", goal: "transcribe" },
  { slug: "how-to-write-bass-tabs-online", title: "How to Write Bass Tabs Online", excerpt: "Choose a tuning, write the groove and connect playable fret positions with clear note lengths and rests.", instrument: "bass", goal: "editor" },
  { slug: "how-to-practise-a-bassline-with-tabs", title: "How to Practise a Bassline with Tabs", excerpt: "Use loops and practice playback speed to work on note endings, position shifts and the kick-and-bass relationship.", instrument: "bass", goal: "editor" },
  { slug: "how-to-write-ukulele-tabs-high-g-low-g", title: "How to Write Ukulele Tabs: High G and Low G", excerpt: "Understand A–E–C–G tab lines, choose the right G-string register and write a playable ukulele melody.", instrument: "ukulele", goal: "editor" },
  { slug: "how-to-transcribe-a-ukulele-melody", title: "How to Transcribe a Ukulele Melody", excerpt: "Review pitches and rhythm from a recording, then arrange the melody on four strings in your ukulele tuning.", instrument: "ukulele", goal: "transcribe" },
  { slug: "how-to-practise-fingerstyle-ukulele-with-tabs", title: "How to Practise Fingerstyle Ukulele with Tabs", excerpt: "Follow the melody and accompaniment, check simultaneous notes and practise transitions in high-G or low-G tuning.", instrument: "ukulele", goal: "editor" },
];

export const instrumentGuideGroups = [
  { instrument: "piano", label: "Piano" },
  { instrument: "bass", label: "Bass" },
  { instrument: "drums", label: "Drums" },
  { instrument: "ukulele", label: "Ukulele" },
].map(group => ({ ...group, guides: instrumentGuides.filter(guide => guide.instrument === group.instrument) }));

const instrumentLandingPaths: Record<string, InstrumentAudience> = {
  "/piano-transcription": "piano", "/piano-sheet-music-editor": "piano",
  "/audio-to-bass-tabs": "bass", "/bass-tab-editor": "bass",
  "/drum-transcription": "drums", "/drum-notation-editor": "drums",
  "/ukulele-transcription": "ukulele", "/ukulele-tab-editor": "ukulele",
};
export function instrumentGuidesForPath(path: string) {
  return instrumentGuideGroups.find(group => group.instrument === instrumentLandingPaths[path]);
}
