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
    title: "Online tab writing for riffs, solos, and full songs",
    body: "Use Note2Tabs as an online guitar tab editor when you need a fast workspace for riffs, lead guitar phrases, rhythm parts, bass-style single note lines, acoustic arrangements, electric guitar solos, practice exercises, and complete song sections. The editor keeps the work in a readable tablature format so you can move from idea to playable guitar tab without installing desktop notation software.",
  },
  {
    title: "AI transcription cleanup without losing guitarist control",
    body: "Automatic guitar tab generation is useful, but every player knows the first draft usually needs human choices. Clean up AI guitar tabs by adjusting fret positions, note timing, chord voicings, string choices, phrase breaks, and fingering decisions. The goal is a practical guitar tab that feels playable on the fretboard, not just a machine transcription that looks technically busy.",
  },
  {
    title: "Browser-based guitar tab maker for practice material",
    body: "Create quick practice tabs for lessons, cover songs, songwriting ideas, scale fragments, alternate picking studies, fingerstyle patterns, and rehearsal notes. Because the editor runs in the browser, it works as a free guitar tab maker, guitar tablature editor, tab writer, tab creator, and song sketchpad for musicians who want a lightweight tool instead of a heavy notation suite.",
  },
] as const;

const workflowDetails = [
  {
    title: "From audio to editable tablature",
    body: "Start with an MP3, WAV, audio file, or YouTube transcription in Note2Tabs, then open the result in the editor to refine the generated guitar tab. This workflow is built for musicians searching for audio to guitar tab, YouTube to guitar tab, MP3 to guitar tab, AI guitar tab generator, and editable guitar transcription tools.",
  },
  {
    title: "From blank page to organized tab library",
    body: "Open a blank tab when you already know the part, write the core idea, separate song sections, and save the version you want to keep. The library gives returning users a simple place to collect guitar tabs, editable drafts, practice arrangements, song ideas, and finished tablature.",
  },
  {
    title: "From rough notes to playable guitar parts",
    body: "Use the editor to turn scattered fret numbers into a clear arrangement with readable timing, sensible chord shapes, repeatable phrases, and practice-friendly structure. That makes it useful for cover guitarists, bedroom producers, teachers, students, session players, and songwriters who need accurate guitar tabs online.",
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
              <h2 className="section-title section-title--tight">A guitar tab editor built for modern tab workflows</h2>
              <p>
                Note2Tabs is an online guitar tab editor for players who want editable tablature, AI-assisted
                transcription cleanup, and a practical browser-based tab maker in one place. Use it when you need to
                write guitar tabs online, revise generated tabs, organize song sections, improve fretboard positions,
                and turn rough guitar transcription output into something you can actually practice.
              </p>
              <p>
                The editor is designed around real guitar decisions: which string should carry the melody, which fret
                position makes the phrase smoother, whether a chord shape is playable, and where a riff or chorus
                should be split for reading. That makes it a useful guitar tablature editor for beginners, teachers,
                cover guitarists, producers, and songwriters who need fast, readable, searchable guitar tabs.
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
                <h2 className="section-title section-title--tight">Use it as a tab maker, tab editor, and transcription finisher</h2>
                <p className="section-subtitle editor-page-subtitle">
                  A practical workflow for guitarists comparing online tab editors, AI guitar tab generators, and
                  browser-based tablature tools.
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
            <div className="editor-keyword-panel" aria-label="Related guitar tab editor searches">
              <p>
                Related uses: online guitar tab editor, free guitar tab maker, AI guitar tab editor, guitar tablature
                editor, guitar tab creator, browser guitar tab writer, editable guitar tabs, guitar transcription
                editor, audio to guitar tab editor, MP3 to guitar tab editor, YouTube to guitar tab editor, guitar tab
                generator with editing, chord tab editor, solo tab editor, riff tab maker, and guitar practice tab
                organizer.
              </p>
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
