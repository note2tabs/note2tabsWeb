export type SeoFeaturePage = {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  steps: Array<{ title: string; body: string }>;
  detail: {
    title: string;
    paragraphs: string[];
    benefits: Array<{ title: string; body: string }>;
  };
  contentSections: Array<{
    title: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
  faqs: Array<{ question: string; answer: string }>;
  relatedSlugs: string[];
};

export const seoFeaturePages: SeoFeaturePage[] = [
  {
    slug: "guitar-tab-fingering-optimizer",
    title: "Guitar Tab Fingering Optimizer",
    metaTitle: "Guitar Tab Fingering Optimizer | Note2Tabs",
    description:
      "Find more playable string and fret positions, compare alternate fingerings, and generate practical cut positions for guitar-tab phrases.",
    steps: [
      { title: "Open or create a tab", body: "Start with a blank tab, import a file, or continue from an audio transcription." },
      { title: "Choose the playing area", body: "Set the fretboard position and compare the available string-and-fret choices for the same pitches." },
      { title: "Keep the playable version", body: "Apply the fingering that fits your hand position, then split and organize the phrase for practice." },
    ],
    detail: {
      title: "Turn correct notes into a tab that feels natural on guitar",
      paragraphs: [
        "A pitch alone does not tell a guitarist where to play it. The same note can appear on several strings, and an individually correct fret choice can still make the complete phrase awkward. Note2Tabs keeps pitch and fretboard position connected so you can compare alternatives in context.",
        "Use the fingering controls to move a line toward a practical hand position, review alternate positions for notes and chords, and keep the version that reduces unnecessary jumps. Cut positions help separate phrases and song sections without rewriting the notes around them.",
      ],
      benefits: [
        { title: "Fretboard-aware choices", body: "Compare positions that produce the same pitch instead of treating every note as a fixed fret." },
        { title: "Phrase-level optimization", body: "Keep neighboring notes in a more consistent playing area when that suits the riff." },
        { title: "Generated section cuts", body: "Generate a starting set of cut positions, then add, move, or remove them to organize the phrase." },
      ],
    },
    contentSections: [
      {
        title: "Automatic suggestions with the final choice left to the guitarist",
        paragraphs: [
          "Automatic fingering is most useful as a starting point, not an irreversible answer. Note2Tabs lets you inspect the suggested string and fret, compare alternatives, and adjust the result when the next chord, slide, bend, or position shift changes what is comfortable.",
        ],
        bullets: ["Single-note alternate positions", "Chord fingering alternatives", "String and fret optimization", "Playing-area controls"],
      },
      {
        title: "Use cut positions to make long tabs easier to edit",
        paragraphs: [
          "Generate cut positions to divide the timeline into workable sections, then adjust them without rewriting the underlying performance. Cuts are useful for separating an intro from a verse, isolating a solo phrase, or creating smaller practice loops after an imported transcription. Automatic cut generation is available after saving the draft to an account.",
        ],
      },
    ],
    faqs: [
      { question: "What is a guitar-tab fingering optimizer?", answer: "It helps choose practical string and fret positions when the same notes can be played in multiple places on the guitar neck." },
      { question: "Can I override an automatic fingering?", answer: "Yes. Suggestions remain editable, so you can choose a different string, fret, chord shape, or playing position." },
      { question: "Does fingering optimization change the pitch?", answer: "No. Alternate positions can preserve the pitch while changing where it is played on the fretboard." },
      { question: "Can the editor generate cut positions?", answer: "Yes. After saving a draft to an account, you can generate a starting set of cuts and then add, move, or remove them manually." },
    ],
    relatedSlugs: ["guitar-tab-key-detector", "guitar-tab-editor-shortcuts"],
  },
  {
    slug: "guitar-tab-key-detector",
    title: "Guitar Tab Key Detector and Snap-to-Key Editor",
    metaTitle: "Guitar Tab Key Detector & Snap-to-Key Tool | Note2Tabs",
    description:
      "Detect the likely key of a guitar tab, snap notes to its scale, and step pitches up or down through the active key without rebuilding the tab.",
    steps: [
      { title: "Load the music", body: "Open a tab you created, imported, or generated from a recording." },
      { title: "Detect or choose a key", body: "Analyze the notes and chords for a likely key, or select the scale you want to use." },
      { title: "Snap or step notes", body: "Keep new notes in key or move a selected pitch up and down through scale tones." },
    ],
    detail: {
      title: "Keep music-theory tools inside the guitar-tab workflow",
      paragraphs: [
        "Key detection gives you a useful musical starting point when a transcription or imported tab does not identify its key. Note2Tabs analyzes the notes and chords already in the editor and lets you confirm or replace the detected result.",
        "Once a key is set, snap-to-key can constrain newly placed notes to the chosen scale. The plus and minus note controls can then move a selected pitch to the next scale tone while keeping a playable string-and-fret position.",
      ],
      benefits: [
        { title: "Automatic key estimate", body: "Detect a likely root and scale from the notes and chords in the current tab." },
        { title: "Snap notes to a scale", body: "Place new notes with the active key as a guide instead of correcting every pitch afterward." },
        { title: "Scale-aware pitch steps", body: "Move a selected note to the next pitch in the key and continue editing in the same workspace." },
      ],
    },
    contentSections: [
      {
        title: "When key detection helps",
        paragraphs: [
          "Key detection is especially useful after importing MIDI, MusicXML, or an AI transcription whose pitch events are present but whose musical context is not labeled. The detected key is a suggestion: borrowed chords, modal phrases, and chromatic notes can make more than one interpretation reasonable.",
        ],
      },
      {
        title: "Snap-to-key is a writing aid, not a restriction",
        paragraphs: [
          "Turn snap-to-key on while sketching a melody or riff, then turn it off whenever you need a chromatic passing tone, bend target, or outside note. The tab remains fully editable either way.",
        ],
      },
    ],
    faqs: [
      { question: "Can Note2Tabs detect the key of a guitar tab?", answer: "Yes. The editor can estimate a likely key from the notes and chords in the current project." },
      { question: "What does snap to key do?", answer: "It guides newly placed notes toward pitches in the selected scale. You can switch it off whenever the music needs notes outside that key." },
      { question: "What do the plus and minus controls do with snap-to-key enabled?", answer: "They move a selected note to the next playable pitch above or below it in the active key." },
    ],
    relatedSlugs: ["guitar-tab-fingering-optimizer", "guitar-chord-strumming-editor"],
  },
  {
    slug: "guitar-chord-strumming-editor",
    title: "Guitar Chord and Strumming Editor",
    metaTitle: "Guitar Chord & Strumming Editor | Note2Tabs",
    description:
      "Build chord tracks with playable fingering diagrams, alternate voicings, and editable downstrokes, upstrokes, and muted strums.",
    steps: [
      { title: "Add a chord track", body: "Keep rhythm-guitar chords separate from lead-tab or melody tracks." },
      { title: "Choose the voicing", body: "Review the chord fingering diagram and select the shape that suits the arrangement." },
      { title: "Shape the strumming", body: "Place downstrokes, upstrokes, and muted strokes, or start from a quick rhythmic pattern." },
    ],
    detail: {
      title: "Write the chord shape and the way it should be played",
      paragraphs: [
        "A chord name does not fully describe a guitar part. Its voicing determines the notes and hand position, while the strumming pattern determines the rhythm and feel. Note2Tabs combines both decisions in a dedicated chord track.",
        "Choose among available chord fingerings, view the diagram, adjust the chord length, and open the strum editor to place individual strokes. Quick whole-beat, half-beat, and quarter-beat patterns provide a starting point that remains editable.",
      ],
      benefits: [
        { title: "Dedicated chord tracks", body: "Arrange chords on their own timeline alongside lead and tab tracks." },
        { title: "Built-in chord diagrams", body: "See the strings and frets used by the current voicing while you edit." },
        { title: "Detailed strum control", body: "Place down, up, and muted strokes and hear them during playback." },
      ],
    },
    contentSections: [
      {
        title: "Alternative chord fingerings for real arrangements",
        paragraphs: [
          "Open-position and movable chord shapes can represent the same harmony while sounding and feeling different. Comparing voicings inside the tab helps you choose one that connects smoothly to the chords around it.",
        ],
      },
      {
        title: "From a basic pulse to a custom strumming pattern",
        paragraphs: [
          "Start with a quick repeated pattern, then drag, add, remove, or change individual strum markers. This makes it possible to preserve accents, muted strokes, and syncopation instead of displaying only a chord symbol above the bar.",
        ],
      },
    ],
    faqs: [
      { question: "Can I create a separate chord track?", answer: "Yes. Chord tracks can sit alongside other guitar tracks in the same editor project." },
      { question: "Does the editor show guitar chord diagrams?", answer: "Yes. Chord fingerings are shown as playable string-and-fret shapes, with alternative voicings available where supported." },
      { question: "Can I edit individual strums?", answer: "Yes. Add or move downstrokes, upstrokes, and muted strokes, or begin with one of the quick strumming patterns." },
    ],
    relatedSlugs: ["guitar-tab-fingering-optimizer", "guitar-tab-practice-trainer"],
  },
  {
    slug: "guitar-tab-editor-shortcuts",
    title: "Guitar Tab Editor with Keyboard Shortcuts",
    metaTitle: "Guitar Tab Editor with Shortcuts | Note2Tabs",
    description:
      "Edit guitar tabs faster with keyboard shortcuts for notes, timing, cuts, playback, bends, hammer-ons, pull-offs, and common cleanup work.",
    steps: [
      { title: "Open a tab", body: "Start blank or bring in a transcription or supported tab file." },
      { title: "Select the phrase", body: "Work on individual notes, chords, bars, or a complete song section." },
      { title: "Edit without breaking flow", body: "Use shortcuts and guitar-specific controls to clean up timing, techniques, and layout." },
    ],
    detail: {
      title: "A browser tab editor designed for repeated cleanup",
      paragraphs: [
        "Editing a full tab involves the same actions many times: selecting notes, moving them, changing duration, splitting sections, copying bars, and checking playback. Keyboard shortcuts reduce the distance between hearing a problem and correcting it.",
        "Note2Tabs also keeps guitar-specific expression in the editing workflow. Add or refine bends, hammer-ons, pull-offs, slides, chord shapes, timing, and fret positions instead of flattening the music into plain numbers.",
      ],
      benefits: [
        { title: "Fast note editing", body: "Use keyboard-driven actions for common selection, movement, timing, and playback tasks." },
        { title: "Guitar techniques", body: "Represent bends, hammer-ons, pull-offs, slides, chords, and strumming details." },
        { title: "Section and bar tools", body: "Cut, copy, reorder, and scale material while keeping the song organized." },
      ],
    },
    contentSections: [
      {
        title: "Useful after AI transcription and for tabs written by hand",
        paragraphs: [
          "AI-generated tabs usually need a guitarist to confirm rhythm, fret choices, phrase boundaries, and expressive techniques. The same tools also support a tab written from scratch, so you do not need separate editors for generation and cleanup.",
        ],
        bullets: ["Undo and redo", "Copy and paste bars", "Timing and duration changes", "Grid and key snapping", "Playback controls"],
      },
      {
        title: "Edit musical techniques instead of adding them as plain text",
        paragraphs: [
          "Bends, hammer-ons, pull-offs, and slides affect both how a phrase is read and how it sounds. Keeping these techniques attached to editable note events makes the tab easier to revise and practice later.",
        ],
      },
    ],
    faqs: [
      { question: "Can I edit guitar tabs with keyboard shortcuts?", answer: "Yes. Note2Tabs includes shortcuts for common editor, selection, timing, snapping, and playback actions." },
      { question: "Can the editor represent bends and legato techniques?", answer: "Yes. Guitar-specific editing includes bends, slides, hammer-ons, pull-offs, chords, and strumming information." },
      { question: "Can I use it to fix an AI-generated tab?", answer: "Yes. Transcription drafts can be opened in the same editor for timing, fingering, technique, and section cleanup." },
    ],
    relatedSlugs: ["guitar-tab-fingering-optimizer", "guitar-tab-import-export"],
  },
  {
    slug: "guitar-tab-import-export",
    title: "Guitar Tab Import and Export Tool",
    metaTitle: "Guitar Tab Import & Export Tool | Note2Tabs",
    description:
      "Open common guitar-tab files in your browser, edit their tracks, and export finished work as ASCII tab, MusicXML, MIDI, or Note2Tabs JSON.",
    steps: [
      { title: "Choose a tab file", body: "Import ASCII tab, MusicXML, MIDI, or a supported Guitar Pro file from your device." },
      { title: "Review the tracks", body: "Keep useful tracks, adjust fingerings and timing, and continue editing in the browser." },
      { title: "Export the result", body: "Download the selected track as TXT, MusicXML, MIDI, or Note2Tabs JSON." },
    ],
    detail: {
      title: "Move tab data into and out of the editor without retyping it",
      paragraphs: [
        "Import is available for ASCII tab (.txt, .tab, .asc), MusicXML (.musicxml, .xml), MIDI (.mid, .midi), and common Guitar Pro formats (.gp, .gp3, .gp4, .gp5, .gpx, .gtp). The importer preserves usable tracks and note events so you can continue from an existing arrangement.",
        "When the tab is ready, export the active track as readable ASCII TXT, interoperable MusicXML, MIDI, or a Note2Tabs JSON project file. Format support differs between import and export, so the original file is never silently presented as a format the editor cannot produce.",
      ],
      benefits: [
        { title: "Common tab formats", body: "Start from ASCII, MusicXML, MIDI, or supported Guitar Pro files." },
        { title: "Multi-track import", body: "Bring compatible tracks into one project and choose what to keep or edit." },
        { title: "Four export choices", body: "Download TXT, MusicXML, MIDI, or Note2Tabs JSON from the editor." },
      ],
    },
    contentSections: [
      {
        title: "Supported import formats",
        paragraphs: [
          "The browser importer reads ASCII text tab, standard or compressed MusicXML, MIDI, and common Guitar Pro files. PowerTab, TablEdit, and TuxGuitar extensions are recognized, but currently need conversion to Guitar Pro, MusicXML, MIDI, or ASCII before their musical contents can be imported.",
        ],
        bullets: [".txt, .tab, .asc", ".musicxml, .xml", ".mid, .midi", ".gp, .gp3, .gp4, .gp5, .gpx, .gtp"],
      },
      {
        title: "Export formats and interoperability",
        paragraphs: [
          "Use TXT when you need portable text tablature, MusicXML when moving the score to notation software, MIDI when another music tool needs note events, and Note2Tabs JSON when preserving editor-specific project data.",
        ],
      },
    ],
    faqs: [
      { question: "Can I open Guitar Pro files online?", answer: "Note2Tabs can import .gp, .gp3, .gp4, .gp5, .gpx, and .gtp files for editing in the browser." },
      { question: "Can I import ASCII guitar tabs?", answer: "Yes. Plain-text .txt, .tab, and .asc guitar tablature files are supported within the documented file limits." },
      { question: "Which formats can Note2Tabs export?", answer: "The editor exports TXT, MusicXML, MIDI, and Note2Tabs JSON. It does not currently export a native Guitar Pro file." },
    ],
    relatedSlugs: ["guitar-tab-editor-shortcuts", "guitar-tab-practice-trainer"],
  },
  {
    slug: "guitar-tab-practice-trainer",
    title: "Guitar Tab Practice and Speed Trainer",
    metaTitle: "Guitar Tab Practice & Speed Trainer | Note2Tabs",
    description:
      "Loop difficult guitar-tab sections, slow playback down, and increase the tempo automatically as you build accuracy and speed.",
    steps: [
      { title: "Select the difficult bars", body: "Choose the section you want to repeat instead of restarting the whole song." },
      { title: "Set a comfortable speed", body: "Slow playback down until the notes, rhythm, and fingering are under control." },
      { title: "Train toward the target", body: "Enable the speed trainer to raise the playback rate by your chosen step after each loop." },
    ],
    detail: {
      title: "Turn an editable guitar tab into a focused practice loop",
      paragraphs: [
        "Reading a difficult passage from the beginning every time wastes practice time. Note2Tabs lets you select a range of bars, loop only that section, and keep the tab visible while it plays with guitar sounds.",
        "The speed trainer begins at the playback rate you choose and increases toward a target in configurable steps. Because the practice view and editor share the same project, you can stop, correct a fingering or rhythm, and immediately try the loop again.",
      ],
      benefits: [
        { title: "Bar-based practice loops", body: "Repeat a selected section without rebuilding or exporting a separate audio loop." },
        { title: "Adjustable playback speed", body: "Slow down for accuracy or rehearse above normal speed when appropriate." },
        { title: "Progressive speed training", body: "Choose a target and increment so each completed loop can become slightly faster." },
      ],
    },
    contentSections: [
      {
        title: "A practical way to learn riffs, solos, and chord changes",
        paragraphs: [
          "Short loops make it easier to isolate a position shift, bend, fast run, or chord change. Begin slowly enough to play cleanly, then increase the tempo only while the phrase remains controlled.",
        ],
      },
      {
        title: "Practice the same tab you edit",
        paragraphs: [
          "If a fingering or rhythm remains awkward, pause playback and correct it in place. This keeps practice feedback connected to the saved tab instead of forcing you to remember changes across separate tools.",
        ],
      },
    ],
    faqs: [
      { question: "Can I loop only part of a guitar tab?", answer: "Yes. Select the bars you want and enable the practice loop to repeat that range." },
      { question: "Can I slow down tab playback?", answer: "Yes. Playback speed is adjustable, so you can practice below normal speed before working upward." },
      { question: "What does the speed trainer do?", answer: "It can increase playback by a chosen step after each loop until it reaches your target speed." },
    ],
    relatedSlugs: ["guitar-chord-strumming-editor", "guitar-tab-import-export"],
  },
];

export const getSeoFeaturePage = (slug: string) =>
  seoFeaturePages.find((page) => page.slug === slug);
