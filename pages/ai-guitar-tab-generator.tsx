import { useLocale } from "../lib/i18n/react";
import SeoLandingPage from "../components/SeoLandingPage";

export const AI_GENERATOR_META_TITLE =
  "Free AI Guitar Tab Generator | Audio & YouTube";

export default function AiGuitarTabGeneratorPage() {
  const { t } = useLocale();
  return (
    <SeoLandingPage
      title={t("AI Guitar Tab Generator from Audio or YouTube")}
      metaTitle={AI_GENERATOR_META_TITLE}
      description="Try an AI guitar tab generator free with audio or YouTube. Create structured, editable tabs you can play, arrange, practise, and export online."
      canonicalPath="/ai-guitar-tab-generator"
      primaryCta={{ label: "Generate tabs", href: "/transcribe" }}
      secondaryCta={{ label: "Open editor", href: "/gte/new" }}
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
        ],
      }}
      contentSections={[
        {
          title: "Try the AI guitar tab generator free on a short section",
          paragraphs: [
            "You can test Note2Tabs with free monthly credits before processing a longer recording. Start with a clear riff, verse, or solo so you can hear the source and generated tab side by side, inspect the detected notes, and decide how you want to play them.",
          ],
        },
      ]}
      faqs={[
        { question: "What does the AI guitar tab generator produce?", answer: "It produces structured tablature with detected notes, timing, and playable guitar positions. The tab opens as a native project in the Note2Tabs editor." },
        { question: "Can I add guitar techniques and choose different fingerings?", answer: "Yes. Generated tabs remain fully editable, with tools for fingerings, chord shapes, bends, slides, hammer-ons, pull-offs, timing, arrangement, playback, and practice." },
        { question: "Is the AI guitar tab generator free?", answer: "Note2Tabs is free to try with monthly transcription credits. The free plan is useful for testing short riffs and song sections, while Premium adds more credits and full-length audio-file transcription." },
        { question: "Can AI generate guitar tabs from an MP3 or WAV file?", answer: "Yes. Upload MP3, WAV, M4A, AAC, FLAC, OGG, or WebM audio, choose the section, and generate an editable guitar tab." },
        { question: "Can it generate guitar tabs from YouTube?", answer: "Choose any section of a public video. Clip length depends on your plan; you do not need to start at the beginning." },
        { question: "Does it work for a complete song?", answer: "Premium supports full-length uploaded audio-file transcription. YouTube input is designed for focused clips, and complex songs still benefit from section-by-section review." },
      ]}
      relatedLinks={[
        { label: "Convert a YouTube clip to guitar tabs", href: "/youtube-to-guitar-tabs", description: "Paste a public video link and select the exact riff or solo you want to generate." },
        { label: "Convert an MP3 to guitar tabs", href: "/mp3-to-guitar-tabs", description: "Upload an MP3 and turn its notes and timing into an editable tab project." },
        { label: "How to use an AI tab generator", href: "/blog/how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes", description: "Follow the full source, generation, review, and editing workflow." },
        { label: "Compare AI guitar-tab tools", href: "/blog/the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly", description: "See which transcription, editing, playback, and export features matter." },
        { label: "Explore editor features", href: "/features", description: "See the tools for writing, arranging, fingering, playback, practice, import, and export." },
        { label: "Open the guitar tab editor", href: "/gte/new", description: "Write from scratch, import a file, or open a generated transcription." },
      ]}
    />
  );
}
