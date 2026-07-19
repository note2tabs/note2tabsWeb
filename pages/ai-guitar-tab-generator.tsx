import SeoLandingPage from "../components/SeoLandingPage";

export default function AiGuitarTabGeneratorPage() {
  return (
    <SeoLandingPage
      title="AI Guitar Tab Generator"
      metaTitle="AI Guitar Tab Generator | Note2Tabs"
      description="Generate guitar tab drafts from audio or YouTube links, then edit the result into playable tablature."
      canonicalPath="/ai-guitar-tab-generator"
      primaryCta={{ label: "Generate tabs", href: "/transcribe" }}
      secondaryCta={{ label: "Open editor", href: "/editor" }}
      steps={[
        {
          title: "Add a song",
          body: "Upload audio or paste a YouTube link to begin.",
        },
        {
          title: "Generate a draft",
          body: "Create a first-pass guitar tab from the source audio.",
        },
        {
          title: "Make it playable",
          body: "Refine the generated tab with editor controls for structure and fingering.",
        },
      ]}
      detail={{
        title: "Use AI for the first pass, then make the tab yours",
        paragraphs: [
          "The generator listens to a selected audio or YouTube segment and produces a starting guitar tab. That draft saves the repetitive first-pass work while keeping you in control of the musical decisions.",
          "After generation, use Note2Tabs to correct uncertain notes, reorganize sections, compare fingerings, and practise the result. This review step is especially useful for dense mixes, fast passages, bends, and multiple guitars.",
        ],
        benefits: [
          { title: "Two model choices", body: "Choose the available transcription model that fits the speed and processing level you need." },
          { title: "Audio or YouTube", body: "Start from a local recording or a focused segment of a public YouTube video." },
          { title: "Human-in-the-loop editing", body: "Keep every generated note editable instead of treating AI output as final." },
        ],
      }}
      faqs={[
        { question: "What does the AI guitar tab generator produce?", answer: "It produces a draft tablature transcription that you can import, play back, and edit in the Note2Tabs guitar tab editor." },
        { question: "Will it detect every technique automatically?", answer: "Not always. Audio quality and musical complexity affect detection, which is why the result remains fully editable for correction and fingering choices." },
      ]}
    />
  );
}
