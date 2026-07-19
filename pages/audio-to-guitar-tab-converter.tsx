import SeoLandingPage from "../components/SeoLandingPage";

export default function AudioToGuitarTabConverterPage() {
  return (
    <SeoLandingPage
      title="Audio to Guitar Tab Converter"
      metaTitle="Audio to Guitar Tab Converter | Note2Tabs"
      description="Convert audio files into editable guitar tabs online, then refine timing, notes, and fingerings in the browser."
      canonicalPath="/audio-to-guitar-tab-converter"
      primaryCta={{ label: "Start transcribing", href: "/transcribe" }}
      secondaryCta={{ label: "Open editor", href: "/editor" }}
      steps={[
        {
          title: "Upload audio",
          body: "Choose an audio file from your device and send it to the transcriber.",
        },
        {
          title: "Generate tabs",
          body: "Note2Tabs creates a draft guitar tab from the audio.",
        },
        {
          title: "Refine the result",
          body: "Open the tab in the editor to adjust notes, timing, and playable fingerings.",
        },
      ]}
      detail={{
        title: "Turn a recording into a tab you can actually work with",
        paragraphs: [
          "Audio transcription is most useful as a strong first draft. Note2Tabs turns a selected part of your recording into tablature, then keeps the result editable so you can correct timing, move notes, and choose more comfortable fingerings.",
          "Use a clear guitar recording when possible and start with the section you care about most. Short, focused clips are easier to review, while Premium supports full-length audio-file transcription for complete songs.",
        ],
        benefits: [
          { title: "Common audio formats", body: "Upload MP3, WAV, M4A, and other common browser-supported audio files." },
          { title: "Playable draft", body: "Move from detected notes to a structured guitar tab instead of a static block of text." },
          { title: "Built-in cleanup", body: "Adjust notes, timing, tracks, and fingerings in the browser editor." },
        ],
      }}
      faqs={[
        { question: "Does audio transcription create a perfect tab?", answer: "It creates an editable draft. Recording quality, overlapping instruments, and playing technique can affect detection, so reviewing the result in the editor is important." },
        { question: "Which audio files can I upload?", answer: "The uploader accepts common audio formats including MP3, WAV, M4A, AAC, FLAC, OGG, and WebM, subject to your plan's size and clip limits." },
      ]}
    />
  );
}
