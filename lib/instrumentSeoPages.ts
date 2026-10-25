import { transcriptionEntryHref } from "./instrumentTranscriptionEntry";
import type { SeoLandingPageProps } from "../components/SeoLandingPage";

export const INSTRUMENT_SEO_UPDATED = "2026-10-25";
/** Each URL owns a task, not an audio-format or keyword synonym. */
export const instrumentSeoPages: Record<string, SeoLandingPageProps> = {
  "piano-transcription": {
    canonicalPath: "/piano-transcription", hasTranslation: false,
    title: "Turn piano audio into music notation",
    metaTitle: "Piano Transcription to Sheet Music & Music Notation | Note2Tabs",
    description: "Convert piano audio to music notation and sheet music. Edit the notes, check the piano roll and export MIDI or MusicXML from your browser.",
    primaryCta: { label: "Transcribe piano audio", href: transcriptionEntryHref("piano") },
    secondaryCta: { label: "Write piano music instead", href: "/piano-sheet-music-editor" },
    preview: { src: "/images/editor-previews/piano-score.svg", exportLabel: "MIDI · MusicXML", width: 790, height: 290, label: "Piano transcription", transcription: true, sourceLabel: "Piano recording", resultLabel: "Audio → editable sheet music", caption: "Notation example · Edit and play back", alt: "Two bars of piano notation on treble and bass staves" },
    steps: [
      { title: "Choose a piano passage", body: "Upload an MP3, WAV or another supported recording. Select the part you want to learn or arrange." },
      { title: "Transcribe the notes", body: "Generate the piano part, then open its pitched track in the editor’s sheet-music or MIDI view." },
      { title: "Listen and refine", body: "Check the notes against the recording, adjust their timing and export your arrangement." },
    ],
    detail: { title: "A recording is the starting point", paragraphs: [
      "Transcribe a piano cover, an improvisation or a melody you recorded before you forgot it. Note2Tabs connects audio transcription with an editor, so the result stays usable when you want to change a phrase, organise the arrangement or practise it.",
      "Read the piano part on treble and bass staves, or switch to the piano roll to see exactly when each note starts and how long it lasts. The notes and chords keep their pitch and duration in both views.",
    ] },
    contentSections: [
      { title: "Piano and keyboard recordings: MP3, WAV and YouTube", paragraphs: [
        "A clearly recorded piano part gives you an easy reference when checking a transcription. Start with a short phrase, listen to its melody and bass separately, then work through the next section. MP3 and WAV recordings use the same piano workflow, so there is no need to convert your audio just to get started.",
        "For a public YouTube recording, use link mode and select the passage you want to work on. Once the notes are in the editor, the same playback and editing tools apply.",
        "You can also start from a recorded keyboard performance. If your keyboard already provides a MIDI file, import those note events in the piano editor instead of transcribing the audio again.",
      ], action: { label: "Transcribe a YouTube passage", href: transcriptionEntryHref("piano", true) } },
      { title: "Edit piano music notation and export MIDI", paragraphs: [
        "Use sheet view to follow the music at the piano. Use MIDI view to inspect overlapping notes, long sustained tones and the timing of a chord. The two views describe the same editable part.",
        "Export MIDI for a DAW or MusicXML for a notation application. Save your project to return to the arrangement, and use practice mode to repeat a passage at a comfortable playback speed.",
      ] },
      { title: "A practical piano-transcription workflow", paragraphs: ["Start with the opening phrase and check the pulse before polishing individual notes. Our piano guide walks through separating melody from accompaniment, reading note lengths and choosing an export for your next step."], action: { label: "Read the piano transcription guide", href: "/blog/how-to-transcribe-piano-audio-to-sheet-music" } },
    ],
    faqs: [
      { question: "Can I convert piano audio into music notation?", answer: "Yes. Transcribe a piano recording, review the notes on the grand staff and edit the rhythm in sheet or MIDI view. Export MIDI or MusicXML for your next music tool." },
      { question: "Can I turn a piano recording into sheet music?", answer: "Yes. Transcribe the audio, open the piano track in sheet view, and edit the pitches and rhythm in the browser." },
      { question: "Can I convert piano audio to MIDI?", answer: "Yes. Export the editable piano part as MIDI to continue in a DAW or another music tool." },
      { question: "Can I edit both hands of a piano part?", answer: "You can edit pitches across treble and bass staves and inspect overlapping notes in MIDI view. Check the voicing and staff placement as you arrange the piece." },
      { question: "Can I try piano transcription for free?", answer: "The free plan includes transcription credits. See the pricing page for the current allowance and recording limits." },
    ],
    relatedLinks: [
      { label: "Piano sheet music editor", href: "/piano-sheet-music-editor", description: "Write and refine piano notation." },
      { label: "Piano transcription guide", href: "/blog/how-to-transcribe-piano-audio-to-sheet-music", description: "Work through a recording one phrase at a time." },
      { label: "Plans and pricing", href: "/pricing", description: "Compare transcription credits and models." },
    ],
  },
  "piano-sheet-music-editor": {
    canonicalPath: "/piano-sheet-music-editor", hasTranslation: false,
    title: "Write piano music notation online",
    metaTitle: "Piano Music Notation & Sheet Music Editor | Note2Tabs",
    description: "Write piano sheet music in an online music notation editor. Use treble and bass staves, a piano roll and playback, then export MIDI or MusicXML.",
    primaryCta: { label: "Open piano editor", href: "/gte/new?track=piano" },
    secondaryCta: { label: "Start from a piano recording", href: "/piano-transcription" },
    preview: { src: "/images/editor-previews/piano-score.svg", exportLabel: "MIDI · MusicXML", width: 790, height: 290, label: "Piano sheet music editor", alt: "An original two-bar piano phrase with melody and bass accompaniment", caption: "Piano notation · Treble and bass staves" },
    steps: [
      { title: "Start a piano score", body: "Open a piano track directly. Write in guest mode or sign in to keep the piece in your library." },
      { title: "Shape the arrangement", body: "Place notes and chords, choose durations and edit the melody and accompaniment in context." },
      { title: "Hear what you wrote", body: "Play the part back, loop a section for practice and export your music when it is ready." },
    ],
    detail: { title: "An online music notation editor for piano", paragraphs: [
      "Use the piano score editor to create sheet music without installing notation software. A piano arrangement needs more than a list of pitches. The duration of a bass note, the spacing between melody notes and the voicing of a chord all change how the piece feels. Edit those decisions in sheet view, with treble and bass staves for the complete part.",
      "Switch to MIDI view when you want to see note lengths and overlaps directly. Changes belong to the same project, so you can move between a readable score and a timing-focused piano roll without maintaining two separate arrangements.",
    ] },
    contentSections: [
      { title: "Write a melody, build an accompaniment", paragraphs: [
        "Start with a short melody or a chord progression. Enter the notes, listen back and add the bass part beneath it. Keep repeated phrases together and check transitions between sections before expanding the piece.",
        "Use the key tools as a guide while writing, then adjust individual notes and durations for the phrasing you want. Playback lets you check the result immediately, including from a phone.",
      ] },
      { title: "Bring an existing piano part", paragraphs: [
        "Import supported MIDI or MusicXML files when the notes already exist. Open the pitched track to review the notation, then inspect the piano roll for overlapping voices or a sustained chord.",
        "When a recording is your source, start with piano transcription and continue editing the generated part in the same workspace. When you already know the notes, the blank piano editor is the direct route.",
      ], action: { label: "Read the MIDI-to-sheet-music guide", href: "/blog/how-to-edit-piano-midi-as-sheet-music" } },
      { title: "Practise and keep the arrangement", paragraphs: ["Loop a difficult passage and choose a slower practice playback speed. Save the project for your next session, export MIDI for production, or export MusicXML to continue engraving in a notation application."] },
    ],
    faqs: [
      { question: "Can I write piano sheet music without importing a file?", answer: "Yes. Open a blank piano track and write notes and chords directly in the music notation editor. You can inspect the same part in the piano roll and hear it with playback." },
      { question: "Is the online piano editor free?", answer: "Yes. You can start writing in guest mode without installing software. Sign in to save the project to your library." },
      { question: "Does the piano editor have playback?", answer: "Yes. Play and pause from sheet or practice view on desktop and mobile, and return to the beginning when you want to rehearse again." },
      { question: "Can I switch between notation and piano roll?", answer: "Yes. Sheet and MIDI views work with the same notes in your piano track." },
      { question: "Can I export my piano music?", answer: "Export MIDI, MusicXML or a Note2Tabs project file to keep working with the arrangement." },
    ],
    relatedLinks: [
      { label: "Piano transcription", href: "/piano-transcription", description: "Start an arrangement from a recording." },
      { label: "MIDI to piano sheet music", href: "/blog/how-to-edit-piano-midi-as-sheet-music", description: "Check rhythm, staff placement and voicing." },
      { label: "Instrument tools", href: "/instruments", description: "Arrange the rest of the band." },
    ],
  },
  "drum-transcription": {
    canonicalPath: "/drum-transcription", hasTranslation: false,
    title: "Turn drum audio into editable notation",
    metaTitle: "Drum Transcription – Audio to Drum Notation & MIDI | Note2Tabs",
    description: "Transcribe a drum recording, review the groove in drum notation, and edit kick, snare and cymbal hits. Listen back and export the part as MIDI.",
    primaryCta: { label: "Transcribe drum audio", href: transcriptionEntryHref("drums") },
    secondaryCta: { label: "Write a drum part instead", href: "/drum-notation-editor" },
    preview: { src: "/images/editor-previews/drum-score.svg", exportLabel: "MIDI · Project", width: 790, height: 220, label: "Drum transcription", transcription: true, sourceLabel: "Drum recording", resultLabel: "Audio → editable drum notation", caption: "Groove example · Kick, snare and hi-hat", alt: "Two-bar drum score with hi-hat crosses, snare notes and bass drum notes" },
    steps: [
      { title: "Choose the groove", body: "Upload a recording and select the beat, fill or song section you want to transcribe." },
      { title: "Open the drum track", body: "Generate the transcription, then open the drum part to review the rhythm." },
      { title: "Check each hit", body: "Listen back, adjust the kit voices and timing, then keep the part for practice or production." },
    ],
    detail: { title: "Keep the groove editable", paragraphs: [
      "Use a rehearsal take, a recorded fill or a drum stem as the starting point for a part you can work with. Drum transcription turns the performance into individual events, so a misplaced snare or an extra hi-hat is an edit rather than a reason to start again.",
      "Read the pattern in drum notation or inspect its hits on the drum timeline. Kick, snare, toms and cymbals keep their own roles while you build the arrangement around them.",
    ] },
    contentSections: [
      { title: "Drum music notation and kit voices", paragraphs: ["Drum notation identifies the kit voice and the rhythm of each hit. Read the kick, snare and cymbal parts together when they land on the same subdivision, or inspect the drum lanes separately to check a particular event. Our notation guide uses a simple backbeat to connect the written pattern with what you hear."], action: { label: "Read the drum notation guide", href: "/blog/how-to-read-drum-notation" } },
      { title: "Hear the beat before changing it", paragraphs: [
        "Compare one or two bars with the recording. Listen for the kick pattern first, then the snare backbeat and the subdivision on the hi-hat or ride. Add fills after the basic groove is clear.",
        "A drum-only take or stem makes this comparison straightforward. For a full-band recording, open the generated drum track and work on its rhythm separately from the pitched instruments.",
      ] },
      { title: "From drum audio to MIDI", paragraphs: ["Export the drum part as MIDI for a DAW, where you can continue arranging and choose a drum sound. Keep a Note2Tabs project file when you want to preserve the editable workspace, or save the song to your account to practise it later." ] },
      { title: "Learn the transcription workflow", paragraphs: ["Our drum guide shows how to check a backbeat, recognise simultaneous kit hits and keep a fill aligned with the following bar."], action: { label: "Read the drum transcription guide", href: "/blog/how-to-transcribe-drums-from-a-recording" } },
    ],
    faqs: [
      { question: "Can I transcribe drums from an audio file?", answer: "Yes. Upload a recording, run the transcriber and open its drum track for playback and editing." },
      { question: "Can I edit the drum transcription?", answer: "Yes. Adjust individual hits, their timing and kit voices in the drum editor." },
      { question: "Can I export a drum transcription as MIDI?", answer: "Yes. Export MIDI to continue arranging the drum part in your music software." },
      { question: "Can I start with a YouTube drum cover?", answer: "Use the transcriber’s YouTube mode with a public video and select the passage you want to work on." },
    ],
    relatedLinks: [
      { label: "Drum notation editor", href: "/drum-notation-editor", description: "Write beats and fills from scratch." },
      { label: "Drum transcription guide", href: "/blog/how-to-transcribe-drums-from-a-recording", description: "Check the groove one layer at a time." },
      { label: "Bass transcription", href: "/audio-to-bass-tabs", description: "Work on the other half of the rhythm section." },
    ],
  },
  "drum-notation-editor": {
    canonicalPath: "/drum-notation-editor", hasTranslation: false,
    title: "Write drum notation online",
    metaTitle: "Free Drum Notation Editor Online with Playback | Note2Tabs",
    description: "Write drum beats and fills in your browser. Edit kick, snare, toms and cymbals, hear the groove with playback, and export your drum part as MIDI.",
    primaryCta: { label: "Open drum editor", href: "/gte/new?track=drums" },
    secondaryCta: { label: "Start from a drum recording", href: "/drum-transcription" },
    preview: { src: "/images/editor-previews/drum-score.svg", exportLabel: "MIDI · Project", width: 790, height: 220, label: "Drum notation editor", alt: "An original drum groove written on a percussion staff", caption: "Drum notation · Write, listen and practise" },
    steps: [
      { title: "Open a drum track", body: "Start a blank drum part in your browser. Guest mode lets you begin without an account." },
      { title: "Build the pattern", body: "Place kick, snare and cymbal hits, then add toms or change the subdivision for a fill." },
      { title: "Play the groove", body: "Listen back, repeat the passage and arrange the next section in the same project." },
    ],
    detail: { title: "A workspace for beats, fills and complete parts", paragraphs: [
      "Write a simple backbeat or lay out an entire drum arrangement. The drum workspace keeps the kit voices separate so you can see what the hands and feet play together. Score view gives you readable percussion notation; the drum timeline lets you inspect the timing of individual hits.",
      "Start with the pulse, add the snare pattern and place the cymbal subdivision. Playback helps you check the feel before copying the groove into the next bar or building a fill around it.",
    ] },
    contentSections: [
      { title: "Keep fills connected to the next bar", paragraphs: ["A fill is useful when it leads cleanly into the following beat. Write the last bar of a section together with the first bar after it, listen through the transition and adjust the placement of the final tom or crash. Keep bass and other instruments in the project when you want to hear the arrangement together."] },
      { title: "Write, repeat and practise", paragraphs: ["Loop a pattern while learning it, or change the practice playback speed to work through a difficult passage. Notes remain editable, so you can simplify a busy groove for a rehearsal and return to the full part later."] },
      { title: "Save the part for your next session", paragraphs: ["Sign in to keep the project in your library. Export MIDI for production or a native project file for continuing in Note2Tabs. If the groove comes from a recording, start with drum transcription and edit the result here."], action: { label: "Explore drum transcription", href: "/drum-transcription" } },
    ],
    faqs: [
      { question: "Can I write drum sheet music online?", answer: "Yes. Start a drum track, place the kit hits and use score view to read the rhythm as drum notation." },
      { question: "Can I hear the drum pattern?", answer: "Yes. Playback lets you hear the groove while you edit its hits and timing." },
      { question: "Can I arrange drums with bass and piano?", answer: "Yes. Drum, bass, guitar and piano tracks can share the same project." },
      { question: "Is the drum editor free to start?", answer: "Yes. Open a drum track in guest mode. Sign in when you want to save the project to your library." },
    ],
    relatedLinks: [
      { label: "Drum transcription", href: "/drum-transcription", description: "Turn a recording into an editable drum part." },
      { label: "Bass tab editor", href: "/bass-tab-editor", description: "Write the bassline alongside the groove." },
      { label: "Instrument tools", href: "/instruments", description: "Choose the next part to arrange." },
    ],
  },
  "ukulele-tab-editor": {
    canonicalPath: "/ukulele-tab-editor", hasTranslation: false,
    title: "Write ukulele tabs online",
    metaTitle: "Free Ukulele Tab Maker & Editor with Playback | Note2Tabs",
    description: "Create ukulele tabs on four strings with G–C–E–A tuning. Edit fret numbers and rhythm, hear the part with playback, and save or export your arrangement.",
    primaryCta: { label: "Open ukulele editor", href: "/gte/new?track=ukulele" },
    secondaryCta: { label: "Start from a ukulele recording", href: "/ukulele-transcription" },
    preview: { src: "/images/editor-previews/ukulele-tab.svg", exportLabel: "TXT · MIDI", width: 790, height: 220, label: "Ukulele tab editor", alt: "Two bars of ukulele tablature on A, E, C and G strings", caption: "Four-string ukulele tab · G–C–E–A" },
    steps: [
      { title: "Start a ukulele track", body: "Open a four-string track in standard high-G tuning, ready to write in guest mode." },
      { title: "Write the phrase", body: "Choose strings and frets, set note lengths and arrange the melody into bars." },
      { title: "Listen and keep it", body: "Check the rhythm with playback, then save your project or export the part." },
    ],
    detail: { title: "Four strings, with the tuning that matters", paragraphs: [
      "Standard ukulele tuning runs G–C–E–A from the fourth string to the first. The editor displays A at the top of the tab, followed by E, C and G, so fret numbers line up with the strings you play.",
      "A high-G ukulele has a re-entrant tuning: the G string is higher than the C and E strings. Start in high G or choose the low-G preset when your instrument uses a lower fourth string. The fretboard mapping follows the selected tuning.",
    ] },
    contentSections: [
      { title: "A tab maker for melodies and fingerpicking", paragraphs: ["Write a melody one phrase at a time, add the notes of a fingerpicked accompaniment and use playback to check how they fit together. Edit the string and fret when you want a more comfortable position without changing the musical idea."] },
      { title: "Keep rhythm alongside fret numbers", paragraphs: ["A fret number tells you where to play, but the timing tells you when. Set note lengths, leave space for rests and listen through the bar before repeating the pattern. Keep sections together when arranging a longer song."], action: { label: "Read the ukulele tab guide", href: "/blog/how-to-write-ukulele-tabs-high-g-low-g" } },
      { title: "Use your ukulele part beyond this session", paragraphs: ["Save a Note2Tabs project file to keep the tuning and editable part together. Export a text tab for reading or MIDI to carry the pitches and timing into another music tool. Sign in when you want the song in your library."] },
    ],
    faqs: [
      { question: "Which ukulele tuning does the editor open?", answer: "A new ukulele track opens in standard high-G G–C–E–A tuning. You can choose the low-G preset from the tuning controls." },
      { question: "Does the tab use four strings?", answer: "Yes. The lines are A, E, C and G from top to bottom, matching standard ukulele tab." },
      { question: "Can I create ukulele tabs for free?", answer: "Yes. Start in guest mode without installing software, then sign in to save the project to your library." },
      { question: "Can I hear or export the tab?", answer: "Yes. Use playback while editing, then export a text tab, MIDI or a native Note2Tabs project file." },
    ],
    relatedLinks: [
      { label: "Ukulele transcription", href: "/ukulele-transcription", description: "Start with a recorded ukulele part." },
      { label: "Ukulele tuning and tablature", href: "/blog/how-to-write-ukulele-tabs-high-g-low-g", description: "Choose high G or low G for your arrangement." },
      { label: "Instrument tools", href: "/instruments", description: "Write the rest of the arrangement." },
    ],
  },
  "ukulele-transcription": {
    canonicalPath: "/ukulele-transcription", hasTranslation: false,
    title: "Transcribe a ukulele recording",
    metaTitle: "Ukulele Transcription – Audio to Editable Notes | Note2Tabs",
    description: "Turn a ukulele recording into editable notes and timing. Review the melody, build the arrangement and continue writing on a four-string ukulele track.",
    primaryCta: { label: "Transcribe ukulele audio", href: transcriptionEntryHref("ukulele") },
    secondaryCta: { label: "Write a ukulele tab instead", href: "/ukulele-tab-editor" },
    preview: { src: "/images/editor-previews/ukulele-tab.svg", exportLabel: "TXT · MIDI", width: 790, height: 220, label: "Ukulele transcription", transcription: true, sourceLabel: "Ukulele recording", resultLabel: "Audio → editable notes", caption: "Ukulele arrangement example · Four strings", alt: "A two-bar ukulele melody arranged as four-string tablature" },
    steps: [
      { title: "Choose the recording", body: "Upload a ukulele take and select the melody or fingerpicked passage you want to work on." },
      { title: "Review the notes", body: "Run the audio transcriber and listen to the generated notes and timing in the editor." },
      { title: "Arrange for your instrument", body: "Use a four-string ukulele track to write the part in your tuning and choose playable fret positions." },
    ],
    detail: { title: "Keep the idea you heard", paragraphs: [
      "Use a ukulele recording to capture a melody, revisit an improvisation or work out a fingerpicked phrase. The transcriber gives you pitches and timing to review, and the editor gives you a place to build the arrangement.",
      "Transcribed pitches and ukulele fret positions are different musical decisions. Review the notes first, then choose positions for your instrument’s high-G or low-G tuning in the ukulele editor. A comfortable arrangement keeps repeated phrases in positions that make sense under your fingers.",
    ] },
    contentSections: [
      { title: "Start with the melody or a fingerpicked passage", paragraphs: ["Choose a recording where you can hear the part clearly. Work on a short phrase, check the rhythm in playback and compare the generated pitches with what you hear. For a strummed accompaniment, listen for the individual notes you want in the arrangement rather than assuming one chord shape for every sound."] },
      { title: "Arrange the notes on G–C–E–A strings", paragraphs: ["The ukulele editor opens a four-string track in standard high-G tuning and also offers a low-G preset. Enter the melody on the appropriate strings, adjust durations and listen back to the complete phrase."], action: { label: "Open the ukulele tab editor", href: "/ukulele-tab-editor" } },
      { title: "Build a part you can return to", paragraphs: ["Keep the audio-derived notes and your arrangement in the same project. Save it to your library or keep a native project export. MIDI carries pitches and timing into another music tool; a text tab gives you a readable four-string part for practice."] },
    ],
    faqs: [
      { question: "Can I use a ukulele recording with the transcriber?", answer: "Yes. Upload the recording to generate editable pitches and timing, then review and arrange the part in the editor." },
      { question: "Is audio transcription the same as choosing ukulele frets?", answer: "No. Transcription identifies notes and timing. Your arrangement chooses strings and frets for the tuning you play, which you can write and adjust in a ukulele track." },
      { question: "Can I write the result in high-G or low-G tuning?", answer: "Yes. The ukulele tab editor has both tuning presets for arranging your part." },
      { question: "Can I start from an MP3?", answer: "Yes. Upload an MP3, WAV or another supported recording and select the passage to transcribe." },
    ],
    relatedLinks: [
      { label: "Ukulele tab editor", href: "/ukulele-tab-editor", description: "Write the four-string arrangement." },
      { label: "Ukulele tab guide", href: "/blog/how-to-write-ukulele-tabs-high-g-low-g", description: "Match the tab to your tuning." },
      { label: "Plans and pricing", href: "/pricing", description: "Compare transcription credits." },
    ],
  },
};
