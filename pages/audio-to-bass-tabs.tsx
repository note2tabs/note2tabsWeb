import SeoLandingPage from "../components/SeoLandingPage";

export default function AudioToBassTabsPage() {
  return <SeoLandingPage
    title="Turn bass audio into tabs"
    metaTitle="Audio to Bass Tabs – Bass Transcription Online | Note2Tabs"
    description="Transcribe a bass recording into editable tablature. Upload your audio, generate tabs, then listen, refine the bassline and export your part."
    canonicalPath="/audio-to-bass-tabs"
    hasTranslation={false}
    primaryCta={{ label: "Transcribe bass audio", href: "/transcribe" }}
    secondaryCta={{ label: "Write a bass tab instead", href: "/bass-tab-editor" }}
    preview={{ src: "/images/editor-previews/bass-transcription-tab.svg", width: 790, height: 220, label: "Audio to bass tabs", transcription: true, alt: "Two-bar bass tablature with fret numbers on four strings" }}
    steps={[
      { title: "Choose your recording", body: "Upload your bass audio and select the passage you want to transcribe." },
      { title: "Generate the tab", body: "Run the transcriber to turn the recording’s notes and timing into editable tablature." },
      { title: "Make it your own", body: "Listen back, refine the notes and fingering, and export the part for practice or arranging." },
    ]}
    detail={{
      title: "From a recording to a bassline you can practise",
      paragraphs: [
        "Use a recorded riff, rehearsal take or bass cover as the starting point for your tab. Audio transcription gives you notes and timing to work with, so you can spend your session learning and shaping the part.",
        "Follow the groove in playback, check the rhythm and work through a phrase at a time. Keep the transcription editable as you choose positions that suit how you play the bass.",
      ],
    }}
    contentSections={[
      { title: "MP3, WAV and your own bass recordings", paragraphs: [
        "Start with an MP3, WAV or another supported audio file. A direct bass recording or an isolated bass stem makes it easier to hear the line you want to learn, from a repeating groove to a walking bass passage.",
        "Choose the clearest recording you have and select the section you need. For a longer arrangement, work through the song’s sections and keep developing the part in the editor.",
      ] },
      { title: "Hear the rhythm. Adjust the fingering.", paragraphs: [
        "Bass parts depend on both pitch and timing. Play the tab back while checking note lengths, rests and the way the line sits across the bar. Loop a passage to practise the groove.",
        "Use the bass editor to adjust string and fret positions on a four-string E–A–D–G staff. Arrange bass and guitar parts together when you want to develop the rest of the song.",
      ], action: { label: "See the bass editor", href: "/bass-tab-editor" } },
      { title: "Keep the part after transcription", paragraphs: [
        "Export a text tab for a readable part, MIDI for your next music session or MusicXML for a notation workflow. Save a Note2Tabs project file to keep working with the editor data.",
        "If you already know the notes and want to write them yourself, open a blank bass track instead. The bass tab editor takes you straight to writing without uploading a recording.",
      ] },
    ]}
    faqs={[
      { question: "Can I transcribe bass audio into tabs?", answer: "Yes. Upload a bass recording to the transcriber, generate an editable tab and continue refining the part in the editor." },
      { question: "Can I use an MP3 bass recording?", answer: "Yes. You can upload MP3, WAV and other supported audio formats through the transcriber." },
      { question: "What recording should I use?", answer: "Use a recording where you can hear the bassline clearly. A direct recording, bass cover or isolated bass stem is a useful starting point." },
      { question: "Can I edit the bass tab afterwards?", answer: "Yes. Adjust notes, rhythm and fretboard positions, use playback and loops, and arrange the part in the editor." },
      { question: "Can I try bass transcription for free?", answer: "Yes. The free plan includes transcription credits. You can view the available plans and credits on the pricing page." },
      { question: "Can I write a bass tab without audio?", answer: "Yes. Open the bass tab editor to start a blank four-string bass track and enter the part yourself." },
    ]}
    relatedLinks={[
      { label: "Bass tab editor", href: "/bass-tab-editor", description: "Write and edit four-string bass tabs." },
      { label: "Import and export", href: "/features/guitar-tab-import-export", description: "Move your music between tools." },
      { label: "Plans and pricing", href: "/pricing", description: "Compare transcription plans." },
    ]}
  />;
}
