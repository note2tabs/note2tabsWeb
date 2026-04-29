import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { gteApi } from "../../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../../lib/gteGuestDraft";
import SeoHead, { SITE_NAME, absoluteUrl } from "../../components/SeoHead";

const LIBRARY_PATH = "/gte";
const GUEST_EDITOR_PATH = `/gte/${GTE_GUEST_EDITOR_ID}`;

const heroProofPoints = ["No install", "Blank tab in one click", "Works after transcription"] as const;

const editorWorkflow = [
  {
    step: "01",
    title: "Start with a clean tab",
    body: "Open the editor immediately and begin writing, or jump in after a Note2Tabs transcription gives you a draft.",
  },
  {
    step: "02",
    title: "Fix what matters",
    body: "Adjust timing, string choices, chord shapes, fingerings, and section boundaries without digging through a heavy notation app.",
  },
  {
    step: "03",
    title: "Save a playable version",
    body: "Keep finished tabs in your library when signed in, so every song can move from rough draft to practice-ready.",
  },
] as const;

const editorControls = [
  "Timing and note placement",
  "Chord shapes and voicings",
  "Single-note fingering alternatives",
  "Section cuts and song structure",
  "Saved transcriptions and drafts",
] as const;

const conversionReasons = [
  {
    title: "Start without a signup wall",
    body: "Open an editable tab first. Create an account later when you want to keep work in your library.",
  },
  {
    title: "Stay in a familiar tab workflow",
    body: "Work with tabs, sections, chord choices, and drafts instead of switching into a heavy notation tool.",
  },
  {
    title: "Keep moving after transcription",
    body: "Use the editor as the next step when an AI transcription is close but still needs human musical judgment.",
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
    "Edit guitar tabs online in a fast browser-based editor for timing, fingerings, chord shapes, and song structure.";
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

      <section className="editor-landing-hero" aria-labelledby="editor-hero-title">
        <div className="editor-landing-product-visual" aria-hidden="true">
          <div className="editor-landing-product-window">
            <div className="editor-landing-product-toolbar">
              <span>Verse 1</span>
              <span>92 BPM</span>
              <span>4/4</span>
            </div>
            <div className="editor-landing-tab-preview">
              <div className="editor-landing-tab-label">Clean electric guitar</div>
              <pre>{`e|-----0---------0------|-----3-----2-----0---|
B|-------1---------1----|-------3-----3-------|
G|---0-----0---2-----2--|---0-----0-----0-----|
D|-2---------3----------|-0-------------------|
A|----------------------|-----------2---------|
E|----------------------|-3-------------------|`}</pre>
              <div className="editor-landing-selection">
                <span>Chord shape</span>
                <strong>G major</strong>
              </div>
            </div>
            <div className="editor-landing-product-footer">
              <span>Cut section</span>
              <span>Optimize fingering</span>
              <span>Save draft</span>
            </div>
          </div>
        </div>

        <div className="container editor-landing-shell">
          <div className="editor-landing-hero-copy">
            <p className="editor-landing-eyebrow">Online guitar tab editor</p>
            <h1 id="editor-hero-title" className="editor-landing-title">
              Make rough guitar tabs playable faster.
            </h1>
            <p className="editor-landing-subtitle">
              Start from a blank tab or clean up a transcription draft. Edit timing, fingerings, chord shapes, and song
              sections in one focused browser workspace.
            </p>
            <div className="editor-landing-hero-actions">
              <button
                type="button"
                onClick={() => void handleCreate()}
                className="button-primary editor-landing-primary-cta"
                disabled={creating}
              >
                {creating ? "Starting..." : "Start editing free"}
              </button>
              <Link href={LIBRARY_PATH} className="editor-landing-secondary-link">
                Open your library
              </Link>
            </div>
            <ul className="editor-landing-proof-row" aria-label="Editor benefits">
              {heroProofPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {error && <div className="error editor-landing-error">{error}</div>}
          </div>
        </div>
      </section>

      <main className="editor-landing-page">
        <section className="editor-landing-band">
          <div className="container editor-landing-section">
            <div className="editor-landing-section-header">
              <p className="editor-landing-section-label">Workflow</p>
              <h2>From first note to usable tab in three steps</h2>
              <p>Open a tab, fix the passages that need judgment, then keep the version worth practicing.</p>
            </div>
            <div className="editor-landing-step-grid">
              {editorWorkflow.map((item) => (
                <article key={item.title} className="editor-landing-step-card">
                  <span>{item.step}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="editor-landing-band editor-landing-band--control">
          <div className="container editor-landing-control-layout">
            <div className="editor-landing-section-header editor-landing-section-header--left">
              <p className="editor-landing-section-label">Control</p>
              <h2>Fix the musical decisions that make a tab worth practicing</h2>
              <p>
                A transcription can get close, but guitarists still need to decide what is playable. Note2Tabs gives
                those editing controls their own clear path.
              </p>
              <div className="editor-landing-inline-actions">
                <button type="button" onClick={() => void handleCreate()} className="button-primary" disabled={creating}>
                  {creating ? "Starting..." : "Open the editor"}
                </button>
              </div>
            </div>
            <ul className="editor-landing-control-list">
              {editorControls.map((item) => (
                <li key={item}>
                  <span aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="editor-landing-band">
          <div className="container editor-landing-section">
            <div className="editor-landing-section-header">
              <p className="editor-landing-section-label">Less friction</p>
              <h2>Get from idea to editable tab without detours</h2>
              <p>
                The page keeps the promise simple: start editing first, then save and organize when the tab is worth
                keeping.
              </p>
            </div>
            <div className="editor-landing-reason-grid">
              {conversionReasons.map((item) => (
                <article key={item.title} className="editor-landing-reason">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="editor-landing-band editor-landing-band--faq">
          <div className="container editor-landing-faq-layout">
            <div className="editor-landing-section-header editor-landing-section-header--left">
              <p className="editor-landing-section-label">Questions</p>
              <h2>Quick answers before you start</h2>
            </div>
            <div className="editor-landing-faqs">
              {editorFaqs.map((faq) => (
                <article key={faq.question} className="editor-landing-faq">
                  <h3>{faq.question}</h3>
                  <p>{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="editor-landing-final">
          <div className="container editor-landing-final-inner">
            <div>
              <p className="editor-landing-section-label">Start now</p>
              <h2>Open a guitar tab and start editing.</h2>
              <p>Use guest mode immediately, or sign in later to keep your work in a library.</p>
            </div>
            <div className="button-row editor-landing-final-actions">
              <button type="button" onClick={() => void handleCreate()} className="button-primary" disabled={creating}>
                {creating ? "Starting..." : "Start editing free"}
              </button>
              <Link href={LIBRARY_PATH} className="button-secondary">
                Open your library
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
