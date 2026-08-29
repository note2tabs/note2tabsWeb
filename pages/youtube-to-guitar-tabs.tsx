import SeoLandingPage from "../components/SeoLandingPage";

export default function YoutubeToGuitarTabsPage() {
  return (
    <SeoLandingPage
      title="YouTube to Guitar Tabs Converter"
      metaTitle="YouTube to Guitar Tabs Converter | Note2Tabs"
      description="Paste a YouTube link, choose a riff or solo, and convert the clip into a structured, editable guitar tab—without downloading the video first."
      canonicalPath="/youtube-to-guitar-tabs"
      primaryCta={{ label: "Convert a YouTube link", href: "/transcribe?mode=youtube" }}
      secondaryCta={{ label: "Open editor", href: "/editor" }}
      steps={[
        {
          title: "Paste a link",
          body: "Add a YouTube URL and select the part of the song you want to transcribe.",
        },
        {
          title: "Generate the tab",
          body: "Create a structured guitar tab from the selected YouTube segment.",
        },
        {
          title: "Edit online",
          body: "Use the complete editor to arrange sections, shape notes and chords, practise, and export.",
        },
      ]}
      detail={{
        title: "Focus the transcription on the exact riff you need",
        paragraphs: [
          "Paste a public YouTube URL, set the start and end times, and transcribe a focused clip. The link mode opens automatically, so you can go straight from this page to choosing the section.",
          "Selecting a precise segment makes the result faster to review and avoids spending credits on parts you do not need. Free accounts can transcribe clips up to 30 seconds; Premium accounts can choose longer clips within the first ten minutes of a video.",
        ],
        benefits: [
          { title: "Timestamp controls", body: "Choose a specific solo, riff, or chord passage instead of processing the whole video." },
          { title: "No download step", body: "Start from the YouTube link without first saving an audio file to your device." },
          { title: "Complete editor included", body: "Open the tab to write, arrange, play, practise, and choose guitar positions." },
        ],
      }}
      contentSections={[
        {
          title: "Turn a YouTube riff or solo into an editable tab",
          paragraphs: [
            "The converter reads the selected audio segment and creates timed notes with guitar string and fret positions. The result opens as a real Note2Tabs project—not a screenshot—so you can correct a phrase, choose another fingering, arrange sections, practise loops, and export the tab.",
            "Use the timestamp controls to target the musical part behind your search. A short, clear section is usually more useful than processing an intro, spoken lesson, silence, and the riff together.",
          ],
        },
        {
          title: "Choose a YouTube clip that is easier to transcribe",
          paragraphs: [
            "Clear covers, lessons, playthroughs, and isolated guitar performances give the model more guitar detail than noisy live recordings or full mixes where several instruments occupy the same range.",
            "Set timestamps around the exact riff, chord passage, or solo you need. A focused clip is faster to inspect and makes it easier to compare the generated tab with the original performance.",
          ],
          bullets: [
            "Prefer a video where the guitar is clearly audible.",
            "Free accounts can choose up to 30 seconds; Premium accounts can choose longer clips within the first ten minutes.",
            "Avoid intros, talking, or silence outside the section you need.",
            "Use the same timestamp when you want to play the tab alongside the original performance.",
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
        { question: "How long can the YouTube clip be?", answer: "Free accounts can select up to 30 seconds. Premium accounts can select longer clips, with an end time no later than 10:00 in the video." },
        { question: "Can I edit the generated YouTube tab?", answer: "Yes. The transcription opens as a native Note2Tabs editor project with writing, arrangement, fingering, playback, practice, and export tools." },
        { question: "Do I need to download the YouTube video first?", answer: "No. Paste the public YouTube URL directly, choose the timestamps, and start the transcription from the link." },
        { question: "Is the YouTube-to-tabs converter free?", answer: "You can try it with the free monthly transcription credits and clips up to 30 seconds. Premium supports longer YouTube clips within the first ten minutes." },
        { question: "What can I do with the generated tab?", answer: "Play it, arrange sections, choose alternate fingerings and chord shapes, add guitar techniques, practise loops, and export it from the editor." },
        { question: "Can I convert only one riff or solo from a YouTube video?", answer: "Yes. Enter the start and end timestamps for the exact section you want instead of converting unrelated parts of the video." },
      ]}
      relatedLinks={[
        { label: "YouTube transcription workflow", href: "/blog/youtube-to-guitar-tabs-workflow", description: "Pick a better source video and review the generated clip step by step." },
        { label: "AI guitar tab generator", href: "/ai-guitar-tab-generator", description: "Learn how the model turns a performance into editable guitar tablature." },
        { label: "Audio to guitar tabs", href: "/audio-to-guitar-tab-converter", description: "Upload a local recording when you have the source file." },
        { label: "Online guitar tab editor", href: "/editor", description: "Write from scratch or open a transcription in the complete browser editor." },
      ]}
    />
  );
}
