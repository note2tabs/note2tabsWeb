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

const editorFaqs = [
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
] as const;

export default function EditorLandingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignedIn = Boolean(session?.user?.id);
  const editorDescription =
    "Open a blank guitar tab, clean up a transcription draft, and save playable tabs in your browser.";
  const editorJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Note2Tabs Guitar Tab Editor",
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
        title="Online Guitar Tab Editor | Note2Tabs"
        description={editorDescription}
        canonicalPath="/editor"
        jsonLd={editorJsonLd}
      />

      <main className="page page-home editor-page">
        <section className="hero editor-landing-hero">
          <div className="container hero-stack hero-stack--centered editor-landing-shell">
            <div className="hero-heading">
              <div className="hero-title-row">
                <h1 className="hero-title">Online Guitar Tab Editor</h1>
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
                <article className="editor-faq-item" key={faq.question}>
                  <h3>{faq.question}</h3>
                  <p>{faq.answer}</p>
                </article>
              ))}
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
