import SeoLandingPage from "../components/SeoLandingPage";

export default function YoutubeToGuitarTabsPage() {
  return (
    <SeoLandingPage
      title="YouTube to Guitar Tabs Converter"
      metaTitle="YouTube to Guitar Tabs Converter | Note2Tabs"
      description="Paste a YouTube link, choose a riff or solo, and convert the clip into an editable guitar-tab draft—without downloading the video first."
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
      contentSections={[
        {
          title: "Choose a YouTube clip that is easier to transcribe",
          paragraphs: [
            "Clear covers, lessons, playthroughs, and isolated guitar performances usually create better drafts than noisy live recordings or full mixes where several instruments occupy the same range.",
            "Set timestamps around the exact riff, chord passage, or solo you need. A focused clip is faster to inspect and makes it easier to compare the generated tab with the original performance.",
          ],
          bullets: [
            "Prefer a video where the guitar is clearly audible.",
            "Choose up to 30 seconds within the first ten minutes.",
            "Avoid intros, talking, or silence outside the section you need.",
            "Review the draft against the same timestamp before saving it.",
          ],
        },
        {
          title: "Why the homepage and this converter serve different jobs",
          paragraphs: [
            "The Note2Tabs homepage is the quickest place to start from either audio or YouTube. This page is specifically for people starting with a video link and explains the clip limits, timestamp workflow, source-quality tradeoffs, and editing process in more detail.",
            "If you already have an MP3 or WAV file, use audio upload instead. If the best version is a public cover, lesson, or performance on YouTube, use this focused converter path.",
          ],
        },
      ]}
      faqs={[
        { question: "How long can the YouTube clip be?", answer: "The current YouTube workflow supports a clip of up to 30 seconds, with an end time no later than 10:00 in the video." },
        { question: "Can I edit the generated YouTube tab?", answer: "Yes. The transcription is a draft that can be imported into the Note2Tabs editor for detailed cleanup and practice." },
        { question: "Do I need to download the YouTube video first?", answer: "No. Paste the public YouTube URL directly, choose the timestamps, and start the transcription from the link." },
        { question: "Is the YouTube-to-tabs converter free?", answer: "You can try it with the free monthly transcription credits. The current YouTube clip limit is the same for free and Premium accounts." },
        { question: "Why does a generated tab still need editing?", answer: "Dense mixes, multiple guitars, effects, bends, and fast passages can make pitch, rhythm, or fingering uncertain. The editor lets you compare the draft with the video and correct those choices." },
      ]}
      relatedLinks={[
        { label: "YouTube transcription workflow", href: "/blog/youtube-to-guitar-tabs-workflow", description: "Pick a better source video and review the generated clip step by step." },
        { label: "AI guitar tab generator", href: "/ai-guitar-tab-generator", description: "Learn what the model generates and what still benefits from editing." },
        { label: "Audio to guitar tabs", href: "/audio-to-guitar-tab-converter", description: "Upload a local recording when you have the source file." },
        { label: "Fix an AI-generated tab", href: "/blog/how-to-fix-ai-guitar-tabs", description: "Correct notes, rhythm, string choices, and awkward fingerings." },
      ]}
    />
  );
}
