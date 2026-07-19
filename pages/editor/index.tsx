import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { gteApi } from "../../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../../lib/gteGuestDraft";
import SeoHead, { SITE_NAME, absoluteUrl } from "../../components/SeoHead";

const LIBRARY_PATH = "/gte";
const GUEST_EDITOR_PATH = `/gte/${GTE_GUEST_EDITOR_ID}`;

const editorSteps = [
  {
    title: "Start a tab",
    body: "Open a blank guitar tab in the browser, or continue from a draft made by the transcriber.",
  },
  {
    title: "Clean up the hard parts",
    body: "Adjust the notes, timing, chord shapes, fingerings, and section breaks that need a guitarist's judgment.",
  },
  {
    title: "Keep the playable version",
    body: "Sign in when you want to save tabs in your library and return to them later.",
  },
] as const;

const editAreas = [
  {
    title: "Notes and timing",
    body: "Move notes into place and tighten the rhythm after a rough transcription.",
  },
  {
    title: "Chord shapes",
    body: "Choose shapes that make sense on guitar instead of accepting the first voicing.",
  },
  {
    title: "Fingerings",
    body: "Compare single-note positions and keep the version that is easier to practice.",
  },
  {
    title: "Song sections",
    body: "Split verses, choruses, and phrases so the tab is easier to read.",
  },
] as const;

const seoUseCases = [
  {
    title: "Write riffs, solos, and complete song sections",
    body: "Start from a blank fretboard when you already know the part. Add notes and chords, organize the arrangement into sections, and keep the result in readable guitar tablature without installing notation software.",
  },
  {
    title: "Clean up an AI transcription draft",
    body: "Correct uncertain notes, timing, chord voicings, string choices, phrase breaks, and fingerings after transcription. The goal is a practical tab that feels playable, not a draft you cannot change.",
  },
  {
    title: "Build practice material in the browser",
    body: "Create tabs for lessons, cover songs, songwriting ideas, scale fragments, fingerstyle patterns, and rehearsal notes. Use playback and section structure to keep difficult phrases easy to revisit.",
  },
] as const;

const workflowDetails = [
  {
    title: "From audio to editable tablature",
    body: "Start with an uploaded recording or YouTube transcription, then open the result here to refine the notes, rhythm, chord shapes, and fretboard positions.",
  },
  {
    title: "From blank page to organized tab library",
    body: "Open a blank tab when you already know the part, write the core idea, separate the song into sections, and sign in when you want to keep the version in your library.",
  },
  {
    title: "From rough notes to playable guitar parts",
    body: "Turn scattered fret numbers into a clear arrangement with readable timing, sensible chord shapes, repeatable phrases, and practice-friendly structure.",
  },
] as const;

const editorFaqs = [
  {
    question: "Is the online guitar tab maker free?",
    answer:
      "Yes. You can open a blank tab in guest mode and use the editor without paying. Sign in when you want to save work in your library.",
  },
  {
    question: "Can I use the guitar tab editor without installing anything?",
    answer: "Yes. Note2Tabs runs in the browser, so you can open a blank guitar tab and start editing online.",
  },
  {
    question: "Can I edit tabs created from an audio or YouTube transcription?",
    answer:
      "Yes. The editor is designed to continue from Note2Tabs transcriptions, then refine timing, fingerings, chord shapes, and song sections.",
  },
  {
    question: "Do I need an account to try the editor?",
    answer:
      "You can start in guest mode first. Sign in when you want to keep tabs in your library and return to them later.",
  },
  {
    question: "Is this useful as an AI guitar tab editor?",
    answer:
      "Yes. It is built for editing AI-generated guitar tabs after transcription, especially when you need to correct rhythm, fret choices, chord voicings, and section structure.",
  },
  {
    question: "What kinds of tabs can I make online?",
    answer:
      "You can draft riffs, solos, chord progressions, fingerstyle parts, lesson exercises, cover song sections, and full guitar arrangements directly in the browser.",
  },
] as const;

export default function EditorLandingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignedIn = Boolean(session?.user?.id);
  const editorDescription =
    "Create, edit, play, and organize guitar tabs in your browser. Start free from a blank tab or clean up an AI transcription draft.";
  const editorJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Note2Tabs Online Guitar Tab Maker and Editor",
      applicationCategory: "MusicApplication",
      operatingSystem: "Web",
      url: absoluteUrl("/editor"),
      description: editorDescription,
      provider: {
        "@type": "Organization",
        name: SITE_NAME,
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Guitar Tab Editor",
          item: absoluteUrl("/editor"),
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: editorFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ];

  const handleCreate = async () => {
    if (creating || status === "loading") return;
    setError(null);

    if (!isSignedIn) {
      await router.push(GUEST_EDITOR_PATH);
      return;
    }

    setCreating(true);
    try {
      const data = await gteApi.createEditor();
      await router.push(`/gte/${data.editorId}`);
    } catch (err: any) {
      setError(err?.message || "Could not start a new tab.");
      setCreating(false);
    }
  };

  return (
    <>
      <SeoHead
        title="Free Online Guitar Tab Maker & Editor | Note2Tabs"
        description={editorDescription}
        canonicalPath="/editor"
        jsonLd={editorJsonLd}
      />

      <main className="page page-home editor-page">
        <section className="hero editor-landing-hero">
          <div className="container hero-stack hero-stack--centered editor-landing-shell">
            <div className="hero-heading">
              <div className="hero-title-row">
                <h1 className="hero-title">Free Online Guitar Tab Maker and Editor</h1>
              </div>
              <p className="hero-subtitle editor-landing-subtitle">{editorDescription}</p>
              <div className="button-row hero-cta-row editor-landing-hero-actions">
                <button type="button" onClick={() => void handleCreate()} className="button-primary" disabled={creating}>
                  {creating ? "Starting..." : "Start a blank tab"}
                </button>
                <Link href={LIBRARY_PATH} className="button-secondary">
                  Open library
                </Link>
              </div>
              <p className="editor-landing-note">Guest mode opens right away. Sign in when you want to save work.</p>
              {error && <div className="error editor-landing-error">{error}</div>}
            </div>
          </div>
        </section>

        <section className="steps">
          <div className="container">
            <h2 className="section-title">How it works</h2>
            <div className="how-flow">
              {editorSteps.map((step, index) => (
                <article className="how-step" key={step.title}>
                  <span className="how-step-index">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="steps editor-page-section">
          <div className="container">
            <div className="page-header">
              <div>
                <h2 className="section-title section-title--tight">What you can edit</h2>
                <p className="section-subtitle editor-page-subtitle">
                  Use the editor after transcription, or write from scratch when you already know the part.
                </p>
              </div>
              <button type="button" onClick={() => void handleCreate()} className="button-secondary" disabled={creating}>
                {creating ? "Starting..." : "Open editor"}
              </button>
            </div>
            <div className="editor-edit-grid">
              {editAreas.map((area) => (
                <article className="editor-edit-item" key={area.title}>
                  <h3>{area.title}</h3>
                  <p>{area.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="steps editor-faq-section">
          <div className="container editor-faq-layout">
            <div>
              <h2 className="section-title section-title--tight">Questions</h2>
              <p className="section-subtitle editor-page-subtitle">Short answers before you open a tab.</p>
            </div>
            <div className="editor-faq-list">
              {editorFaqs.map((faq) => (
                <details className="editor-faq-item" key={faq.question}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="steps editor-seo-section">
          <div className="container editor-seo-layout">
            <div className="editor-seo-intro">
              <h2 className="section-title section-title--tight">Make and edit playable guitar tabs online</h2>
              <p>
                Note2Tabs combines a blank guitar tab maker with the editing tools needed after an automatic
                transcription. Write a part you already know, or bring in a generated draft and keep working until the
                rhythm, structure, and fretboard positions make sense.
              </p>
              <p>
                The editor stays focused on guitar decisions: which string should carry a melody, which position makes
                a phrase smoother, whether a chord shape is realistic, and where a riff or chorus should be divided for
                reading and practice.
              </p>
            </div>

            <div className="editor-seo-grid">
              {seoUseCases.map((item) => (
                <article className="editor-seo-card" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="steps editor-workflow-section">
          <div className="container">
            <div className="page-header">
              <div>
                <h2 className="section-title section-title--tight">Choose a starting point, then keep one editable version</h2>
                <p className="section-subtitle editor-page-subtitle">
                  Start from a blank tab or a generated draft and continue in the same browser workspace.
                </p>
              </div>
              <button type="button" onClick={() => void handleCreate()} className="button-secondary" disabled={creating}>
                {creating ? "Starting..." : "Try the editor"}
              </button>
            </div>
            <div className="editor-workflow-grid">
              {workflowDetails.map((item) => (
                <article className="editor-workflow-item" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
            <div className="editor-resource-links" aria-label="Related transcription and editing workflows">
              <Link href="/ai-guitar-tab-generator">
                <strong>Generate a draft with AI</strong>
                <span>Start from audio or YouTube, then finish the result here.</span>
              </Link>
              <Link href="/audio-to-guitar-tab-converter">
                <strong>Convert an audio file</strong>
                <span>Upload MP3, WAV, or another recording and create editable tab.</span>
              </Link>
              <Link href="/free-guitar-tab-maker">
                <strong>Explore the free tab-maker workflow</strong>
                <span>See what you can create before signing in.</span>
              </Link>
            </div>
          </div>
        </section>

        <section className="bottom-transcriber editor-bottom-cta">
          <div className="container">
            <div className="bottom-transcriber-shell">
              <h2 className="bottom-transcriber-title">Start with a blank tab.</h2>
              <p className="bottom-transcriber-subtitle">
                Open the editor now, then save the tab later if it becomes something you want to keep.
              </p>
              <div className="bottom-transcriber-actions">
                <button type="button" onClick={() => void handleCreate()} className="button-primary" disabled={creating}>
                  {creating ? "Starting..." : "Start a blank tab"}
                </button>
                <Link href={LIBRARY_PATH} className="button-secondary">
                  Open library
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
