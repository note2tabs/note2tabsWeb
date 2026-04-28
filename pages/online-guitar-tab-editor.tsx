import SeoLandingPage from "../components/SeoLandingPage";

export default function OnlineGuitarTabEditorPage() {
  return (
    <SeoLandingPage
      title="Online Guitar Tab Editor"
      metaTitle="Online Guitar Tab Editor | Note2Tabs"
      description="Write, edit, organize, and refine guitar tabs online with controls for timing, chord shapes, and playable fingerings."
      canonicalPath="/online-guitar-tab-editor"
      primaryCta={{ label: "Open editor", href: "/gte" }}
      secondaryCta={{ label: "Start transcribing", href: "/#hero" }}
      steps={[
        {
          title: "Start a tab",
          body: "Open a blank tab or continue from a transcription draft.",
        },
        {
          title: "Shape the song",
          body: "Adjust notes, chords, sections, and timing in one workspace.",
        },
        {
          title: "Save your work",
          body: "Keep tabs organized in your library when you are signed in.",
        },
      ]}
    />
  );
}
