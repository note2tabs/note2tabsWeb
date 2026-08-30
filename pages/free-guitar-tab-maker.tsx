import SeoLandingPage from "../components/SeoLandingPage";

export default function FreeGuitarTabMakerPage() {
  return (
    <SeoLandingPage
      title="Free Guitar Tab Maker"
      metaTitle="Free Guitar Tab Maker | Note2Tabs"
      description="Make guitar tabs online for free. Write notes and chords, arrange sections, play and practise your tab, or start from an audio transcription."
      canonicalPath="/free-guitar-tab-maker"
      primaryCta={{ label: "Open free tab maker", href: "/editor" }}
      secondaryCta={{ label: "Create tabs from audio", href: "/transcribe" }}
      steps={[
        {
          title: "Start with audio or blank tabs",
          body: "Transcribe a song from audio, paste a YouTube link, or open the editor.",
        },
        {
          title: "Create your tab",
          body: "Generate from audio or write the complete arrangement in your browser.",
        },
        {
          title: "Edit and save",
          body: "Refine the tab and keep your work in your library when signed in.",
        },
      ]}
      detail={{
        title: "Create tabs from a recording or start with a blank editor",
        paragraphs: [
          "Use the free plan to try audio transcription on short clips, or open the browser editor and write tablature yourself. Both routes lead to the same editable workspace, so you can combine generated notes with your own changes.",
          "The editor is designed around guitar work: multiple tracks, playback, practice loops, fretboard-aware note positions, keyboard shortcuts, and import or export tools are available from the browser.",
        ],
        benefits: [
          { title: "Start without installing software", body: "Create and edit tablature in a modern browser on desktop or mobile." },
          { title: "Free monthly credits", body: "Free accounts receive 10 monthly transcription credits for testing riffs and short ideas." },
          { title: "Save your work", body: "Signed-in users can keep transcriptions and editor projects in their Note2Tabs library." },
        ],
      }}
      contentSections={[
        {
          title: "A free online tab maker built for guitar",
          paragraphs: [
            "Start a blank tab without installing software or creating an account. Add notes and chords on a guitar-aware timeline, choose playable strings and frets, organize the song into sections, and listen back while you work.",
            "Unlike a plain text tab creator, Note2Tabs keeps timing, pitch, fingering, playback, and practice connected. Sign in only when you want to save the project to your library and continue on another device.",
          ],
          bullets: [
            "Write riffs, solos, chord progressions, and complete arrangements.",
            "Choose alternate string and fret positions for the same pitch.",
            "Loop sections and slow playback down while practising.",
            "Import an existing file or continue from an audio transcription.",
          ],
        },
        {
          title: "Make a tab yourself or generate a starting point",
          paragraphs: [
            "Use the editor as a standalone guitar tab maker when you already know the part. If you are starting from a recording, the AI transcriber can generate a structured first version and open it in the same editor for review and arrangement.",
            "The two products complement each other without depending on each other: manual tab making remains available on its own, and every generated transcription stays editable.",
          ],
        },
      ]}
      faqs={[
        { question: "Is the guitar tab maker free?", answer: "Yes. The free plan includes the browser editor and 10 monthly transcription credits, with lower upload and clip limits than Premium." },
        { question: "Can I make a tab without uploading audio?", answer: "Yes. Open the guitar tab editor to create a blank project, import an existing tab file, or type the notes yourself." },
        { question: "Do I need an account to start making tabs?", answer: "No. You can open a blank tab in guest mode immediately. Create an account when you want to save projects to your library." },
        { question: "Can I play and practise the tab I make?", answer: "Yes. The editor includes playback, looping, speed training, and practice mode alongside the writing tools." },
      ]}
      relatedLinks={[
        { label: "Online guitar tab editor", href: "/editor", description: "See the complete editor, its guitar-specific tools, and a visual preview of the workspace." },
        { label: "Guitar tab editor features", href: "/features", description: "Explore fingering, chords, playback, practice, shortcuts, and import or export tools." },
        { label: "AI guitar tab generator", href: "/ai-guitar-tab-generator", description: "Generate an editable starting point from an audio file or YouTube clip." },
        { label: "MP3 to guitar tabs", href: "/mp3-to-guitar-tabs", description: "Turn an MP3 recording into a structured tab you can continue editing." },
      ]}
    />
  );
}
