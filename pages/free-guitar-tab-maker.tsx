import SeoLandingPage from "../components/SeoLandingPage";

export default function FreeGuitarTabMakerPage() {
  return (
    <SeoLandingPage
      title="Free Guitar Tab Maker"
      metaTitle="Free Guitar Tab Maker | Note2Tabs"
      description="Start creating guitar tabs for free with browser-based transcription and editing tools from Note2Tabs."
      canonicalPath="/free-guitar-tab-maker"
      primaryCta={{ label: "Start free", href: "/transcribe" }}
      secondaryCta={{ label: "Open editor", href: "/editor" }}
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
      detail={{
        title: "Create tabs from a recording or start with a blank editor",
        paragraphs: [
          "Use the free plan to try audio transcription on short clips, or open the browser editor and write tablature yourself. Both routes lead to the same editable workspace, so you can combine generated notes with your own changes.",
          "The editor is designed around guitar work: multiple tracks, playback, practice loops, fretboard-aware note positions, keyboard shortcuts, and import or export tools are available from the browser.",
        ],
        benefits: [
          { title: "Start without installing software", body: "Create and edit tablature in a modern browser on desktop or mobile." },
          { title: "Free monthly credits", body: "Free accounts receive 10 monthly transcription credits for testing riffs and short ideas." },
          { title: "Save your work", body: "Signed-in users can keep transcriptions and editor projects in their Note2Tabs library." },
        ],
      }}
      faqs={[
        { question: "Is the guitar tab maker free?", answer: "Yes. The free plan includes the browser editor and 10 monthly transcription credits, with lower upload and clip limits than Premium." },
        { question: "Can I make a tab without uploading audio?", answer: "Yes. Open the guitar tab editor to create a blank project, import an existing tab file, or type the notes yourself." },
      ]}
    />
  );
}
