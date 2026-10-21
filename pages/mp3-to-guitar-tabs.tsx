import { useLocale } from "../lib/i18n/react";
import SeoLandingPage from "../components/SeoLandingPage";

export default function Mp3ToGuitarTabsPage() {
  const { t } = useLocale();
  return (
    <SeoLandingPage
      title={t("MP3 to Guitar Tabs Converter")}
      metaTitle="MP3 to Guitar Tabs Converter – Online & Editable"
      description="Convert MP3 audio to playable, editable guitar tabs online. Select a song section, generate tablature, then practise, edit, and export it with Note2Tabs."
      canonicalPath="/mp3-to-guitar-tabs"
      primaryCta={{ label: "Upload an MP3", href: "/transcribe" }}
      secondaryCta={{ label: "Open editor", href: "/gte/new" }}
      steps={[
        {
          title: "Choose an MP3",
          body: "Upload an MP3 file from your device to begin the transcription flow.",
        },
        {
          title: "Convert to tab",
          body: "Generate a structured guitar tab from the selected audio.",
        },
        {
          title: "Open your project",
          body: "Play, arrange, practise, edit, or export the tab in your browser.",
        },
      ]}
      detail={{
        title: "Convert an MP3 into guitar tabs you can edit and play",
        paragraphs: [
          "Upload an MP3 from your computer or phone and choose the part you want to convert. Note2Tabs analyzes its pitch and timing, maps the performance to guitar strings and frets, and opens the result as a native editor project.",
        ],
      }}
      contentSections={[
        {
          title: "How to get a clearer MP3-to-tab conversion",
          paragraphs: [
            "Use an MP3 in which the guitar is easy to hear. Isolated guitar, direct recordings, lesson demonstrations, covers, and sections with fewer overlapping instruments give the transcriber more detail to analyze.",
          ],
        },
      ]}
      faqs={[
        { question: "Do I need to convert my MP3 first?", answer: "No. MP3 is accepted directly by the uploader, so you can select a clip and start transcription in the browser." },
        { question: "What is the MP3 upload limit?", answer: "Free accounts can upload files up to 50 MB; Premium supports files up to 200 MB. Transcription length limits are shown before you start." },
        { question: "Can an MP3 be converted into editable guitar tabs?", answer: "Yes. Note2Tabs creates a structured editor project with notes, timing, strings, and frets rather than returning only an image or text block." },
        { question: "Can I convert an MP3 to guitar tabs for free?", answer: "The free plan includes monthly credits for trying focused MP3 sections. Current file and transcription limits are shown before processing begins." },
        { question: "Can I edit the tab after converting the MP3?", answer: "Yes. The result opens in the Note2Tabs editor, where you can change timing, fingerings, song sections, techniques, playback, and practice settings." },
      ]}
      relatedLinks={[
        { label: "Audio to guitar tab converter", href: "/audio-to-guitar-tab-converter", description: "Convert WAV, M4A, FLAC, and other supported audio formats as well as MP3." },
        { label: "How to convert audio to guitar tabs", href: "/blog/how-to-convert-audio-to-guitar-tabs", description: "Prepare a recording and review the generated tab step by step." },
        { label: "AI guitar tab generator", href: "/ai-guitar-tab-generator", description: "See how automatic transcription connects to editing and practice." },
        { label: "Online guitar tab editor", href: "/editor", description: "Write a tab manually, import a file, or continue editing a transcription." },
      ]}
    />
  );
}
