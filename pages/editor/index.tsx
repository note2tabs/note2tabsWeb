import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { gteApi } from "../../lib/gteApi";

const EDITOR_VERSION = "1.2.1";
const LIBRARY_PATH = "/gte";

const editorHighlights = [
  {
    title: "A smart editor made to make music easier",
    body: "Start from scratch or shape a rough draft with tools that help you get to a cleaner, more playable tab faster.",
  },
  {
    title: "Optimize fingerings as you go",
    body: "Try cleaner ways to play tricky parts and compare different fingerings until the line feels natural in your hands.",
  },
  {
    title: "Generate cuts and shape segments",
    body: "Split a song into useful sections automatically, then adjust cut points and segments by hand until the structure feels right.",
  },
] as const;

const editorFeatureBullets = [
  "Smart tools that make it easier to turn rough ideas into playable music",
  "Optimize single-note fingerings and compare different chord shapes",
  "Generate cuts automatically and fine-tune cut segments by hand",
  "Write from scratch, clean up drafts, and keep songs organized in one library",
] as const;

const editorQuestions = [
  {
    title: "What does the guitar tab editor do?",
    body: "It gives you a clean place to write, edit, and organize guitar tabs online. You can build a tab from a blank page, clean up one you already started, test better fingerings, and shape the song into clear sections.",
  },
  {
    title: "Why is it different from the transcriber?",
    body: "The transcriber helps you get a first draft from audio. The editor is where you shape that draft into something clear, playable, and worth keeping by adjusting timing, improving fingerings, picking better chord shapes, and organizing the song into segments.",
  },
  {
    title: "Can I change how notes and chords are played?",
    body: "Yes. You can compare different ways to play single notes and full chords, then keep the fingering that feels best for you.",
  },
] as const;

export default function EditorLandingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignedIn = Boolean(session?.user?.id);
  const libraryHref = isSignedIn ? LIBRARY_PATH : `/auth/login?next=${encodeURIComponent(LIBRARY_PATH)}`;

  const handleCreate = async () => {
    if (creating || status === "loading") return;
    setError(null);

    if (!isSignedIn) {
      await router.push("/gte/local");
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
          content="Create, edit, and organize guitar tabs online with a smart guitar tab editor. Optimize fingerings, choose different note and chord shapes, generate cuts, shape segments, refine drafts, and keep your song library in one place."
        />
        <meta key="og:title" property="og:title" content="Online Guitar Tab Editor | Note2Tabs" />
        <meta
          key="og:description"
          property="og:description"
          content="Create guitar tabs from scratch with a smart editor, optimize fingerings, generate cuts, shape segments, and keep your saved songs organized in one place."
        />
        <meta key="twitter:title" name="twitter:title" content="Online Guitar Tab Editor | Note2Tabs" />
        <meta
          key="twitter:description"
          name="twitter:description"
          content="Create guitar tabs online with a smart editor, optimize fingerings, shape segments, and keep your saved songs in one library."
        />
      </Head>

      <section className="hero editor-landing-hero">
        <div className="hero-glow hero-glow--one" />
        <div className="hero-glow hero-glow--two" />
        <img src="/logo01black.png" alt="" aria-hidden="true" className="editor-landing-logo-bg" />
        <div className="container hero-stack hero-stack--centered editor-landing-shell">
          <div className="hero-heading">
            <div className="hero-title-row">
              <h1 className="hero-title">Guitar Editor Canvas</h1>
              <span className="badge editor-version">v{EDITOR_VERSION}</span>
            </div>
            <p className="editor-landing-byline">a smart tab-editor by Note2Tabs</p>
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
              A smart guitar tab editor made to make music easier. Build a tab, optimize fingerings, try better note
              and chord shapes, and generate cuts that help organize the song fast.
            </p>
            <p className="editor-landing-support">
              {isSignedIn
                ? "Jump back into saved songs or open a blank tab right away."
                : "You can start without signing in and save it to your library later."}
            </p>
            {error && <div className="error editor-landing-error">{error}</div>}
          </div>
        </div>
      </section>

      <main className="page">
        <div className="container stack editor-landing-sections">
          <section className="editor-landing-grid" aria-label="Editor highlights">
            {editorHighlights.map((item) => (
              <article key={item.title} className="card-outline editor-landing-card">
                <p className="editor-landing-card-label">Built for real tab work</p>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </article>
            ))}
          </section>

          <section className="editor-landing-split">
            <article className="card editor-landing-story">
              <p className="editor-landing-section-label">What it does</p>
              <h2>A smart editor built to make guitar tab work easier</h2>
              <p>
                The Note2Tabs guitar tab editor is the place for hands-on work. Use it when you want full control
                over notes, chords, timing, and song structure without making the process feel heavy or slow. It is
                built to make music easier to shape, whether you are writing tabs by hand or cleaning up a rough draft.
              </p>
              <p>
                If you already used the transcriber, this is the next step. You can tighten the timing, optimize how
                a phrase is played, choose different fingerings for single notes and full chords, and use generate
                cuts to break the song into useful segments. From there, you can move cut points and shape those
                segments until the arrangement feels right. If you did not use the transcriber, that is fine too. The
                editor stands on its own as a clean online tab maker for guitar players who want to build and organize
                tabs in one place.
              </p>
            </article>

            <article className="card-outline editor-landing-story editor-landing-story--contrast">
              <p className="editor-landing-section-label">Why it feels different</p>
              <h2>Made for better fingerings, cleaner sections, and more playable tabs</h2>
              <ul className="editor-landing-list">
                <li>The transcriber gives you a starting point. The editor helps you make it playable.</li>
                <li>You can use optimize to test easier, smoother, or more natural fingerings as you edit.</li>
                <li>You can choose different ways to play a single note or a full chord instead of settling for the first version.</li>
                <li>You can generate cuts, split the song into segments, and adjust those sections until the structure makes sense.</li>
                <li>Your library keeps saved songs together so you can revisit older ideas without losing them.</li>
              </ul>
            </article>
          </section>

          <section className="card editor-landing-feature-box" aria-label="Editor features">
            <div className="editor-landing-feature-box-copy">
              <p className="editor-landing-section-label">Key features</p>
              <h2>What you can do in the editor</h2>
              <p>
                The editor is built to help you move from rough idea to playable song without fighting the workflow.
              </p>
            </div>
            <ul className="editor-landing-feature-list">
              {editorFeatureBullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="editor-landing-questions">
            <div className="page-header">
              <div>
                <p className="editor-landing-section-label">Common questions</p>
                <h2 className="page-title editor-landing-heading">A clearer way to use the editor</h2>
                <p className="page-subtitle">
                  Short answers for what the editor is for, how it fits the rest of Note2Tabs, and how to get started.
                </p>
              </div>
            </div>
            <div className="editor-landing-grid">
              {editorQuestions.map((item) => (
                <article key={item.title} className="card-outline editor-landing-card editor-landing-card--soft">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card editor-landing-cta">
            <div>
              <p className="editor-landing-section-label">Ready to start?</p>
              <h2>Open your library or start a blank tab</h2>
              <p>
                Use your library for saved songs, or start fresh and shape the tab your own way from the very first
                note.
              </p>
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
