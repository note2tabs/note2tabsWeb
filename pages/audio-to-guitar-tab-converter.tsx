import SeoLandingPage from "../components/SeoLandingPage";

export default function AudioToGuitarTabConverterPage() {
  return (
    <SeoLandingPage
      title="Audio to Guitar Tab Converter"
      metaTitle="Audio to Guitar Tab Converter Online | Note2Tabs"
      description="Upload MP3, WAV, or other audio and convert it into a structured, editable guitar tab with Note2Tabs."
      canonicalPath="/audio-to-guitar-tab-converter"
      primaryCta={{ label: "Start transcribing", href: "/transcribe" }}
      secondaryCta={{ label: "Open editor", href: "/editor" }}
      steps={[
        {
          title: "Upload audio",
          body: "Choose an MP3, WAV, or other supported audio file and select the section you need.",
        },
        {
          title: "Generate tabs",
          body: "Note2Tabs detects pitch and timing, then creates a structured guitar tab you can play and edit.",
        },
        {
          title: "Open your tab",
          body: "Play it back, arrange sections, choose fingerings, practise passages, and export from the editor.",
        },
      ]}
      detail={{
        title: "Turn a recording into a tab you can actually work with",
        paragraphs: [
          "Note2Tabs turns a selected part of an MP3, WAV, or other recording into structured tablature with notes, timing, and playable guitar positions. The result opens as a native editor project, ready for playback, arrangement, practice, and export.",
          "Use a clear guitar recording when possible and start with the section you care about most. Short, focused clips process quickly, while Premium supports full-length audio-file transcription for complete songs.",
        ],
        benefits: [
          { title: "Common audio formats", body: "Upload MP3, WAV, M4A, and other common browser-supported audio files." },
          { title: "Structured guitar tab", body: "Move from a recording to timed, playable tablature instead of a static block of text." },
          { title: "Complete editor included", body: "Write, arrange, play, practise, and export from the browser editor." },
        ],
      }}
      contentSections={[
        {
          title: "Which recordings convert best?",
          paragraphs: [
            "A clear guitar recording, isolated stem, direct input, or rehearsal clip gives the model the most detail to work with. Guitar that is clearly audible and separated from vocals, bass, drums, or another guitar helps preserve the performance in the tab.",
            "You do not need studio-quality audio. Removing long silent sections and choosing the clearest available version helps the transcriber focus its processing on the music you want.",
          ],
          bullets: [
            "Use MP3 for convenient, smaller files.",
            "Use WAV or FLAC when you have a cleaner lossless source.",
            "Choose a focused clip when you only need one riff or solo.",
            "Use full-length audio-file transcription on Premium when you need the complete song.",
          ],
        },
        {
          title: "Converter or guide: choose the right page",
          paragraphs: [
            "This page is the direct product workflow: upload audio, generate a tab, and open it in the editor. If you are still deciding how to prepare a source or isolate guitar in a dense mix, use the detailed audio-to-tabs guide linked below.",
            "Keeping those jobs separate makes the next action clear: use the converter when your file is ready, and use the guide when you want technique and source-preparation advice.",
          ],
        },
      ]}
      faqs={[
        { question: "What does the audio transcriber create?", answer: "It creates a structured, playable guitar tab with detected notes, timing, and guitar positions. It opens as a fully editable project in the Note2Tabs editor." },
        { question: "Which audio files can I upload?", answer: "The uploader accepts common audio formats including MP3, WAV, M4A, AAC, FLAC, OGG, and WebM, subject to your plan's size and clip limits." },
        { question: "Can I convert an MP3 to guitar tabs for free?", answer: "Yes. The free plan includes monthly credits for testing short audio sections. Premium adds more credits, larger uploads, and full-length audio-file transcription." },
        { question: "Can I convert a full song into guitar tabs?", answer: "Yes. Premium supports full-length uploaded audio-file transcription for complete songs." },
        { question: "What should I do if the guitar is buried in the mix?", answer: "Choose a clearer recording, isolated stem, cover, or focused section so the model can capture more of the guitar performance." },
      ]}
      relatedLinks={[
        { label: "Audio-to-tabs workflow guide", href: "/blog/how-to-convert-audio-to-guitar-tabs", description: "Prepare your source and get the most from automatic guitar transcription." },
        { label: "MP3 to guitar tabs", href: "/mp3-to-guitar-tabs", description: "Use the format-specific workflow for an MP3 file." },
        { label: "AI guitar tab generator", href: "/ai-guitar-tab-generator", description: "Understand how AI generation and guitarist-led editing work together." },
        { label: "YouTube to guitar tabs", href: "/youtube-to-guitar-tabs", description: "Use a public video when you do not have the local audio file." },
      ]}
    />
  );
}
