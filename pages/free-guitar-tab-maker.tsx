import SeoLandingPage from "../components/SeoLandingPage";

export default function FreeGuitarTabMakerPage() {
  return (
    <SeoLandingPage
      title="Free Guitar Tab Maker"
      metaTitle="Free Guitar Tab Maker | Note2Tabs"
      description="Start creating guitar tabs for free with browser-based transcription and editing tools from Note2Tabs."
      canonicalPath="/free-guitar-tab-maker"
      primaryCta={{ label: "Start free", href: "/#hero" }}
      secondaryCta={{ label: "Open editor", href: "/gte" }}
      steps={[
        {
          title: "Start with audio or blank tabs",
          body: "Transcribe a song from audio, paste a YouTube link, or open the editor.",
        },
        {
          title: "Create a draft",
          body: "Generate or write the tab structure in your browser.",
        },
        {
          title: "Edit and save",
          body: "Refine the tab and keep your work in your library when signed in.",
        },
      ]}
    />
  );
}
