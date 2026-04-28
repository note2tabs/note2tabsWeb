import SeoLandingPage from "../components/SeoLandingPage";

export default function Mp3ToGuitarTabsPage() {
  return (
    <SeoLandingPage
      title="MP3 to Guitar Tabs"
      metaTitle="MP3 to Guitar Tabs | Note2Tabs"
      description="Upload an MP3 and generate a guitar tab draft that you can copy, save, or refine with the Note2Tabs editor."
      canonicalPath="/mp3-to-guitar-tabs"
      primaryCta={{ label: "Upload an MP3", href: "/#hero" }}
      secondaryCta={{ label: "Open editor", href: "/gte" }}
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
    />
  );
}
