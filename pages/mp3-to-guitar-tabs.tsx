import SeoLandingPage from "../components/SeoLandingPage";

export default function Mp3ToGuitarTabsPage() {
  return (
    <SeoLandingPage
      title="MP3 to Guitar Tabs"
      metaTitle="MP3 to Guitar Tab Converter Online | Note2Tabs"
      description="Convert an MP3 into an editable guitar tab draft online. Start free, then correct notes, timing, and playable fingerings in the Note2Tabs editor."
      canonicalPath="/mp3-to-guitar-tabs"
      primaryCta={{ label: "Upload an MP3", href: "/transcribe" }}
      secondaryCta={{ label: "Open editor", href: "/editor" }}
      steps={[
        {
          title: "Choose an MP3",
          body: "Upload an MP3 file from your device to begin the transcription flow.",
        },
        {
          title: "Convert to tab",
          body: "Generate a guitar tab draft from the selected audio.",
        },
        {
          title: "Keep improving",
          body: "Copy the tab or continue editing it in your browser.",
        },
      ]}
      detail={{
        title: "A practical MP3-to-tab workflow",
        paragraphs: [
          "Upload an MP3 from your computer or phone and choose the part you want to convert. Note2Tabs creates a draft that stays connected to an editing workflow, so detection is the beginning rather than the end of the process.",
          "For the clearest result, use an MP3 with an audible guitar and as little background noise as possible. If several instruments overlap, tell the transcriber so it can use the appropriate processing path.",
        ],
        benefits: [
          { title: "Fast clip selection", body: "Set a start and end time before transcription instead of trimming the MP3 yourself." },
          { title: "Multiple guitar options", body: "Tell the transcriber when a recording includes other instruments or more than one guitar." },
          { title: "Continue in the editor", body: "Shape the generated notes into the fingering and structure you prefer." },
        ],
      }}
      faqs={[
        { question: "Do I need to convert my MP3 first?", answer: "No. MP3 is accepted directly by the uploader, so you can select a clip and start transcription in the browser." },
        { question: "What is the MP3 upload limit?", answer: "Free accounts can upload files up to 50 MB; Premium supports files up to 200 MB. Transcription length limits are shown before you start." },
      ]}
    />
  );
}
