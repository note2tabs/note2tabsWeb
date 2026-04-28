import SeoLandingPage from "../components/SeoLandingPage";

export default function YoutubeToGuitarTabsPage() {
  return (
    <SeoLandingPage
      title="YouTube to Guitar Tabs"
      metaTitle="YouTube to Guitar Tabs | Note2Tabs"
      description="Paste a YouTube link, choose a short segment, and turn it into a draft guitar tab you can edit online."
      canonicalPath="/youtube-to-guitar-tabs"
      primaryCta={{ label: "Convert a YouTube link", href: "/#hero" }}
      secondaryCta={{ label: "Open editor", href: "/gte" }}
      steps={[
        {
          title: "Paste a link",
          body: "Add a YouTube URL and select the part of the song you want to transcribe.",
        },
        {
          title: "Create a draft",
          body: "Generate a guitar tab draft from the selected YouTube segment.",
        },
        {
          title: "Edit online",
          body: "Use the editor to clean up sections, notes, chord shapes, and fingerings.",
        },
      ]}
    />
  );
}
