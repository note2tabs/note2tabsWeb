import SeoLandingPage from "../components/SeoLandingPage";

export default function AudioToGuitarTabConverterPage() {
  return (
    <SeoLandingPage
      title="Audio to Guitar Tab Converter"
      metaTitle="Audio to Guitar Tab Converter | Note2Tabs"
      description="Convert audio files into editable guitar tabs online, then refine timing, notes, and fingerings in the browser."
      canonicalPath="/audio-to-guitar-tab-converter"
      primaryCta={{ label: "Start transcribing", href: "/#hero" }}
      secondaryCta={{ label: "Open editor", href: "/gte" }}
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
    />
  );
}
