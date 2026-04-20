import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { gteApi } from "../../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../../lib/gteGuestDraft";

const LIBRARY_PATH = "/gte";
const GUEST_EDITOR_PATH = `/gte/${GTE_GUEST_EDITOR_ID}`;

const editorHighlights = [
  {
    title: "Start from blank or import a draft",
    body: "Open a clean tab instantly, or continue from a transcription draft when you already have material.",
  },
  {
    title: "Refine fingerings with control",
    body: "Compare options for notes and chords, then keep the shape that is most playable for your hand.",
  },
  {
    title: "Shape structure quickly",
    body: "Generate cuts, split sections, and adjust boundaries until the song layout feels right.",
  },
] as const;

const controlChecklist = [
  "Timing and note placement",
  "Chord shapes and voicing choices",
  "Single-note fingering alternatives",
  "Section cuts and segment boundaries",
  "Transcriptions in your library",
] as const;

const reliabilityBullets = [
  "Browser-based editor with no install",
  "Transcription library for ongoing songs",
  "Works as a standalone workflow or after transcription",
  "Designed for repeat editing sessions",
] as const;

const editorSeoHighlights = [
  "Build tabs from scratch or clean up a rough draft",
  "Compare note and chord fingerings for better playability",
  "Generate song cuts and refine segment boundaries",
  "Keep songs organized in a transcription library",
] as const;

const editorSeoQuestions = [
  {
    title: "What does the guitar tab editor do?",
    body: "It gives you a clean place to write, edit, and organize guitar tabs online. You can start from a blank tab, refine transcribed drafts, and shape timing and structure in one workflow.",
  },
  {
    title: "Why use this after the transcriber?",
    body: "The transcriber gives you a first pass. The editor is where you make decisions about playability, fingering, and section layout before saving the final version.",
  },
  {
    title: "Can I change how notes and chords are played?",
    body: "Yes. You can test alternatives for single notes and full chords, then keep the fingering that feels best for your hands and style.",
  },
] as const;

export default function EditorLandingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignedIn = Boolean(session?.user?.id);
  const libraryHref = isSignedIn ? LIBRARY_PATH : GUEST_EDITOR_PATH;

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
      <Head>
        <title>Online Guitar Tab Editor | Note2Tabs</title>
        <meta
          key="description"
          name="description"
          content="Edit guitar tabs online with precise controls for timing, fingerings, chord shapes, and section structure."
        />
        <meta key="og:title" property="og:title" content="Online Guitar Tab Editor | Note2Tabs" />
        <meta
          key="og:description"
          property="og:description"
          content="Use the Note2Tabs editor to refine tabs, optimize fingerings, and organize songs in one library."
        />
        <meta key="twitter:title" name="twitter:title" content="Online Guitar Tab Editor | Note2Tabs" />
        <meta
          key="twitter:description"
          name="twitter:description"
          content="A browser-based guitar tab editor with precise controls and a transcription library."
        />
      </Head>

      <section className="hero editor-landing-hero">
        <div className="hero-glow hero-glow--one" />
        <div className="hero-glow hero-glow--two" />
        <img src="/logo01black.png" alt="" aria-hidden="true" className="editor-landing-logo-bg" />
        <div className="container hero-stack hero-stack--centered editor-landing-shell">
          <div className="hero-heading">
            <div className="hero-title-row">
              <h1 className="hero-title">Guitar Tab Editor</h1>
            </div>
            <p className="editor-landing-byline">precision editing by Note2Tabs</p>
            <div className="button-row hero-cta-row editor-landing-hero-actions">
              <button type="button" onClick={() => void handleCreate()} className="button-primary" disabled={creating}>
                {status === "loading"
                  ? "Loading..."
                  : creating
                  ? "Starting..."
                  : isSignedIn
                  ? "Create a new tab"
                  : "Start a new tab"}
              </button>
              <Link href={libraryHref} className="button-secondary">
                Open your library
              </Link>
            </div>
            <p className="hero-subtitle editor-landing-subtitle">
              Use it after transcription or start from blank. Edit timing, fingerings, chord shapes, and section
              structure in one workspace.
            </p>
            <p className="editor-landing-support">
              {isSignedIn
                ? "Continue existing songs or open a new tab immediately."
                : "You can start in guest mode first and move to your library later."}
            </p>
            {error && <div className="error editor-landing-error">{error}</div>}
          </div>
        </div>
      </section>

      <main className="page">
        <div className="container stack editor-landing-sections">
          <section className="seo-intro seo-crawler-only" aria-label="Guitar tab editor overview">
            <h2 className="seo-title">Online guitar tab editor for drafting and refinement</h2>
            <p className="seo-copy">
              Note2Tabs includes a browser-based guitar tab editor designed for full revision work. Use it to clean up
              rough transcriptions, write tabs from scratch, and keep songs organized in one library.
            </p>
            <p className="seo-copy">
              Core editing capabilities include timing adjustments, fingering alternatives, chord voicing choices, and
              section cuts for clearer song structure.
            </p>
            <ul>
              {editorSeoHighlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {editorSeoQuestions.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </section>

          <section className="editor-landing-grid" aria-label="Editor highlights">
            {editorHighlights.map((item) => (
              <article key={item.title} className="card-outline editor-landing-card">
                <p className="editor-landing-card-label">Core workflow</p>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </article>
            ))}
          </section>

          <section className="editor-landing-split">
            <article className="card editor-landing-story">
              <p className="editor-landing-section-label">When to use it</p>
              <h2>Use the editor when the draft needs decisions</h2>
              <p>
                The transcriber gives you a starting point. The editor is where you decide what is playable, what to
                keep, and what to rewrite. It is built for real revision work, not just quick previews.
              </p>
              <ul className="editor-landing-list">
                <li>Fix awkward positions before practice.</li>
                <li>Test multiple fingerings for difficult passages.</li>
                <li>Split long songs into practical sections.</li>
                <li>Save versions so progress is not lost.</li>
              </ul>
            </article>

            <article className="card-outline editor-landing-story editor-landing-story--contrast">
              <p className="editor-landing-section-label">What you can control</p>
              <h2>Detailed control without a heavy interface</h2>
              <ul className="editor-landing-list">
                {controlChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </section>

          <section className="card editor-landing-feature-box" aria-label="Reliability">
            <div className="editor-landing-feature-box-copy">
              <p className="editor-landing-section-label">Reliability</p>
              <h2>Built for repeat sessions</h2>
              <p>
                This is a working editor designed for daily use. You can come back to songs, continue edits, and keep
                your tab workflow in one place.
              </p>
            </div>
            <ul className="editor-landing-feature-list">
              {reliabilityBullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="card editor-landing-cta">
            <div>
              <p className="editor-landing-section-label">Start now</p>
              <h2>Open your library or create a new tab</h2>
              <p>Choose a transcription or begin from the first note.</p>
            </div>
            <div className="button-row">
              <button type="button" onClick={() => void handleCreate()} className="button-primary" disabled={creating}>
                {creating ? "Starting..." : isSignedIn ? "Create a new tab" : "Start a new tab"}
              </button>
              <Link href={libraryHref} className="button-secondary">
                Open your library
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
