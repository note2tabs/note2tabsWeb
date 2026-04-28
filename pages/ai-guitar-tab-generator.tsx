import SeoLandingPage from "../components/SeoLandingPage";

export default function AiGuitarTabGeneratorPage() {
  return (
    <SeoLandingPage
      title="AI Guitar Tab Generator"
      metaTitle="AI Guitar Tab Generator | Note2Tabs"
      description="Generate guitar tab drafts from audio or YouTube links, then edit the result into playable tablature."
      canonicalPath="/ai-guitar-tab-generator"
      primaryCta={{ label: "Generate tabs", href: "/#hero" }}
      secondaryCta={{ label: "Open editor", href: "/gte" }}
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
    />
  );
}
