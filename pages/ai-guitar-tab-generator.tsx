import SeoLandingPage from "../components/SeoLandingPage";

export const AI_GENERATOR_META_TITLE =
  "Free AI Guitar Tab Generator | Audio & YouTube";

export default function AiGuitarTabGeneratorPage() {
  return (
    <SeoLandingPage
      title="AI Guitar Tab Generator from Audio or YouTube"
      metaTitle={AI_GENERATOR_META_TITLE}
      description="Try an AI guitar tab generator free with audio or YouTube. Create structured, editable tabs you can play, arrange, practise, and export online."
      canonicalPath="/ai-guitar-tab-generator"
      primaryCta={{ label: "Generate tabs", href: "/transcribe" }}
      secondaryCta={{ label: "Open editor", href: "/editor" }}
      steps={[
        {
          title: "Add a clear source",
          body: "Upload an MP3, WAV, or other audio file, or paste a public YouTube link.",
        },
        {
          title: "Generate the tab",
          body: "Choose a focused section and create structured, playable guitar tablature.",
        },
        {
          title: "Make it yours",
          body: "Play it back, arrange sections, choose fingerings, add techniques, practise, and export.",
        },
      ]}
      detail={{
        title: "From a recording to an editable guitar tab",
        paragraphs: [
          "Note2Tabs analyzes pitch and timing in a recording, maps the performance onto guitar strings and frets, and creates a structured tab rather than a static image or block of text.",
          "The generated tab opens as a native editor project. Use the complete editor to explore comfortable positions, chord shapes, song sections, guitar techniques, playback, and practice tools—or open the editor independently and write from scratch.",
        ],
        benefits: [
          { title: "Free to try", body: "Use the free monthly credits to test a short riff or song section before committing to a longer workflow." },
          { title: "Audio or YouTube input", body: "Start with an uploaded recording or a focused segment from a public YouTube video." },
          { title: "Complete guitar editor", body: "Arrange notes, timing, string choices, chord shapes, techniques, and fingerings." },
        ],
      }}
      contentSections={[
        {
          title: "What helps the AI capture the most detail?",
          paragraphs: [
            "Clear guitar audio gives the model more musical detail to work with. An isolated guitar, direct recording, lesson clip, or audible cover helps the transcriber focus on the guitar when drums, vocals, and several instruments overlap.",
            "The generated project stays fully editable, so you can choose alternative fingerings, add expressive techniques, arrange sections, and shape the tab around how you want to play it.",
          ],
          bullets: [
            "Begin with a focused riff, solo, or song section.",
            "Use the clearest version of the recording available.",
            "Choose whether the source includes other instruments or multiple guitars.",
            "Play the tab alongside the original recording when learning the part.",
          ],
        },
        {
          title: "Choose the workflow that matches your source",
          paragraphs: [
            "Use audio upload when you have the original MP3, WAV, rehearsal recording, or isolated stem. It gives you direct control over the source file and supports full-length audio transcription on Premium.",
            "Use YouTube mode for a public cover, lesson, live performance, or song section that you do not have as a local file. Select the riff or solo you need, then open the generated tab in the same complete editor.",
          ],
        },
        {
          title: "Transcription, editing, and practice in one connected workflow",
          paragraphs: [
            "The AI transcriber turns sound into structured tablature and saves transcription time. The editor then gives you creative control over repeated phrases, hand positions, chord voicings, song sections, playback, and practice.",
            "These products work together without depending on each other: generate a tab from audio when that is the fastest starting point, or open the editor directly to write a riff, lesson, arrangement, or complete song yourself.",
          ],
        },
      ]}
      faqs={[
        { question: "What does the AI guitar tab generator produce?", answer: "It produces structured tablature with detected notes, timing, and playable guitar positions. The tab opens as a native project in the Note2Tabs editor." },
        { question: "Can I add guitar techniques and choose different fingerings?", answer: "Yes. Generated tabs remain fully editable, with tools for fingerings, chord shapes, bends, slides, hammer-ons, pull-offs, timing, arrangement, playback, and practice." },
        { question: "Is the AI guitar tab generator free?", answer: "Note2Tabs is free to try with monthly transcription credits. The free plan is useful for testing short riffs and song sections, while Premium adds more credits and full-length audio-file transcription." },
        { question: "Can AI generate guitar tabs from an MP3 or WAV file?", answer: "Yes. Upload MP3, WAV, M4A, AAC, FLAC, OGG, or WebM audio, choose the section, and generate an editable guitar tab." },
        { question: "Can it generate guitar tabs from YouTube?", answer: "Yes. Paste a public YouTube link and choose a clip within the first ten minutes. Free clips can be up to 30 seconds, while Premium supports longer selections." },
        { question: "Does it work for a complete song?", answer: "Premium supports full-length uploaded audio-file transcription. YouTube input is designed for focused clips, and complex songs still benefit from section-by-section review." },
      ]}
      relatedLinks={[
        { label: "How to use an AI tab generator", href: "/blog/how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes", description: "Follow the full source, generation, review, and editing workflow." },
        { label: "Compare AI guitar-tab tools", href: "/blog/the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly", description: "See which transcription, editing, playback, and export features matter." },
        { label: "Explore editor features", href: "/features", description: "See the tools for writing, arranging, fingering, playback, practice, import, and export." },
        { label: "Open the guitar tab editor", href: "/editor", description: "Write from scratch, import a file, or open a generated transcription." },
      ]}
    />
  );
}
