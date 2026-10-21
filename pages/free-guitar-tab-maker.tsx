import { useLocale } from "../lib/i18n/react";
import SeoLandingPage from "../components/SeoLandingPage";

export default function FreeGuitarTabMakerPage() {
  const { t } = useLocale();
  return (
    <SeoLandingPage
      title={t("Free Guitar Tab Maker")}
      metaTitle="Free Guitar Tab Maker | Note2Tabs"
      description="Make guitar tabs online for free. Write notes and chords, arrange sections, play and practise your tab, or start from an audio transcription."
      canonicalPath="/free-guitar-tab-maker"
      primaryCta={{ label: "Open free tab maker", href: "/gte/new" }}
      secondaryCta={{ label: "Create tabs from audio", href: "/transcribe" }}
      steps={[
        {
          title: "Start a blank tab",
          body: "Open the editor in guest mode, then sign in only when you want to save your work.",
        },
        {
          title: "Create your tab",
          body: "Generate from audio or write the complete arrangement in your browser.",
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
        ],
      }}
      contentSections={[
        {
          title: "A free online tab maker built for guitar",
          paragraphs: [
            "Start a blank tab without installing software or creating an account. Add notes and chords on a guitar-aware timeline, choose playable strings and frets, organize the song into sections, and listen back while you work.",
          ],
        },
      ]}
      faqs={[
        { question: "Is the guitar tab maker free?", answer: "Yes. The free plan includes the browser editor and 10 monthly transcription credits, with lower upload and clip limits than Premium." },
        { question: "Can I make a tab without uploading audio?", answer: "Yes. Open the guitar tab editor to create a blank project, import an existing tab file, or type the notes yourself." },
        { question: "Do I need an account to start making tabs?", answer: "No. You can open a blank tab in guest mode immediately. Create an account when you want to save projects to your library." },
        { question: "Can I play and practise the tab I make?", answer: "Yes. The editor includes playback, looping, speed training, and practice mode alongside the writing tools." },
      ]}
      relatedLinks={[
        { label: "Online guitar tab editor", href: "/editor", description: "See the complete editor, its guitar-specific tools, and a visual preview of the workspace." },
        { label: "Guitar tab editor features", href: "/features", description: "Explore fingering, chords, playback, practice, shortcuts, and import or export tools." },
        { label: "AI guitar tab generator", href: "/ai-guitar-tab-generator", description: "Generate an editable starting point from an audio file or YouTube clip." },
        { label: "MP3 to guitar tabs", href: "/mp3-to-guitar-tabs", description: "Turn an MP3 recording into a structured tab you can continue editing." },
      ]}
    />
  );
}
