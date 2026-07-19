import SeoLandingPage from "../components/SeoLandingPage";

export default function AudioToGuitarTabConverterPage() {
  return (
    <SeoLandingPage
      title="Audio to Guitar Tab Converter"
      metaTitle="Audio to Guitar Tab Converter Online | Note2Tabs"
      description="Upload MP3, WAV, or other audio and convert it into an editable guitar-tab draft. Refine notes, timing, and fingerings online."
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
          body: "Note2Tabs detects pitch and timing, then maps the result into an editable guitar-tab draft.",
        },
        {
          title: "Refine the result",
          body: "Listen back and adjust uncertain notes, timing, string choices, and playable fingerings.",
        },
      ]}
      detail={{
        title: "Turn a recording into a tab you can actually work with",
        paragraphs: [
          "Audio transcription is most useful as a strong first draft. Note2Tabs turns a selected part of an MP3, WAV, or other recording into tablature, then keeps the result editable so you can correct timing, move notes, and choose more comfortable fingerings.",
          "Use a clear guitar recording when possible and start with the section you care about most. Short, focused clips are easier to review, while Premium supports full-length audio-file transcription for complete songs.",
        ],
        benefits: [
          { title: "Common audio formats", body: "Upload MP3, WAV, M4A, and other common browser-supported audio files." },
          { title: "Playable draft", body: "Move from detected notes to a structured guitar tab instead of a static block of text." },
          { title: "Built-in cleanup", body: "Adjust notes, timing, tracks, and fingerings in the browser editor." },
        ],
      }}
      contentSections={[
        {
          title: "Which recordings convert best?",
          paragraphs: [
            "A clear guitar recording, isolated stem, direct input, or rehearsal clip usually produces a cleaner draft than a compressed full-band mix. The model has an easier job when the guitar is audible and does not overlap heavily with vocals, bass, drums, or another guitar.",
            "You do not need studio-quality audio, but it helps to remove long silent sections and choose the cleanest version of the song available. Start with a familiar riff so you can quickly hear where the draft needs correction.",
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
            "This page is the direct product workflow: upload audio, generate a tab, and edit the result. If you are still deciding how to prepare a source, troubleshoot a dense mix, or review an automatic transcription, use the detailed audio-to-tabs guide linked below.",
            "Keeping those jobs separate makes the next action clear: use the converter when your file is ready, and use the guide when you want technique and source-preparation advice.",
          ],
        },
      ]}
      faqs={[
        { question: "Does audio transcription create a perfect tab?", answer: "It creates an editable draft. Recording quality, overlapping instruments, and playing technique can affect detection, so reviewing the result in the editor is important." },
        { question: "Which audio files can I upload?", answer: "The uploader accepts common audio formats including MP3, WAV, M4A, AAC, FLAC, OGG, and WebM, subject to your plan's size and clip limits." },
        { question: "Can I convert an MP3 to guitar tabs for free?", answer: "Yes. The free plan includes monthly credits for testing short audio sections. Premium adds more credits, larger uploads, and full-length audio-file transcription." },
        { question: "Can I convert a full song into guitar tabs?", answer: "Premium supports full-length uploaded audio-file transcription. The time needed to review the draft still depends on the recording and musical complexity." },
        { question: "What should I do if the guitar is buried in the mix?", answer: "Try a cleaner recording, isolated stem, cover, or shorter section. After generation, use the editor and the original audio together to correct the most uncertain passages." },
      ]}
      relatedLinks={[
        { label: "Audio-to-tabs workflow guide", href: "/blog/how-to-convert-audio-to-guitar-tabs", description: "Prepare a better source and turn the automatic draft into playable tab." },
        { label: "MP3 to guitar tabs", href: "/mp3-to-guitar-tabs", description: "Use the format-specific workflow for an MP3 file." },
        { label: "AI guitar tab generator", href: "/ai-guitar-tab-generator", description: "Understand how AI generation and guitarist-led editing work together." },
        { label: "YouTube to guitar tabs", href: "/youtube-to-guitar-tabs", description: "Use a public video when you do not have the local audio file." },
      ]}
    />
  );
}
