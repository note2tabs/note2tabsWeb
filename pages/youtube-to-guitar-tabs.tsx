import SeoLandingPage from "../components/SeoLandingPage";

export default function YoutubeToGuitarTabsPage() {
  return (
    <SeoLandingPage
      title="YouTube to Guitar Tabs"
      metaTitle="YouTube to Guitar Tabs | Note2Tabs"
      description="Paste a YouTube link, choose a short segment, and turn it into a draft guitar tab you can edit online."
      canonicalPath="/youtube-to-guitar-tabs"
      primaryCta={{ label: "Convert a YouTube link", href: "/transcribe?mode=youtube" }}
      secondaryCta={{ label: "Open editor", href: "/editor" }}
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
      detail={{
        title: "Focus the transcription on the exact riff you need",
        paragraphs: [
          "Paste a public YouTube URL, set the start and end times, and transcribe a focused clip. The link mode opens automatically, so you can go straight from this page to choosing the section.",
          "Selecting a precise segment makes the result faster to review and avoids spending credits on parts you do not need. YouTube transcription currently supports clips up to 30 seconds within the first ten minutes of a video.",
        ],
        benefits: [
          { title: "Timestamp controls", body: "Choose a specific solo, riff, or chord passage instead of processing the whole video." },
          { title: "No download step", body: "Start from the YouTube link without first saving an audio file to your device." },
          { title: "Edit after detection", body: "Open the draft in the tab editor and correct notes, rhythm, and playable positions." },
        ],
      }}
      faqs={[
        { question: "How long can the YouTube clip be?", answer: "The current YouTube workflow supports a clip of up to 30 seconds, with an end time no later than 10:00 in the video." },
        { question: "Can I edit the generated YouTube tab?", answer: "Yes. The transcription is a draft that can be imported into the Note2Tabs editor for detailed cleanup and practice." },
      ]}
    />
  );
}
