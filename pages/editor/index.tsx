import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { gteApi } from "../../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../../lib/gteGuestDraft";
import SeoHead, {
  EDITOR_APPLICATION_ID,
  ORGANIZATION_ID,
  WEBSITE_ID,
  absoluteUrl,
} from "../../components/SeoHead";

const LIBRARY_PATH = "/gte";
const GUEST_EDITOR_PATH = `/gte/${GTE_GUEST_EDITOR_ID}`;

const editorSteps = [
  {
    title: "Start your way",
    body: "Write from a blank tab, import an existing file, or create a project from audio with the Note2Tabs transcriber.",
  },
  {
    title: "Shape every detail",
    body: "Compose notes, arrange sections, choose chord shapes and fingerings, and add the techniques that define the part.",
  },
  {
    title: "Keep the playable version",
    body: "Sign in when you want to save tabs in your library and return to them later.",
  },
] as const;

const editAreas = [
  {
    title: "Notes and timing",
    body: "Write melodies and riffs, control their rhythm, and hear every change during playback.",
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
      "Yes. A Note2Tabs transcription opens as a native editor project, with the same timing, fingering, chord, arrangement, playback, and practice tools as any tab you create yourself.",
  },
  {
    question: "Do I need an account to try the editor?",
    answer:
      "You can start in guest mode first. Sign in when you want to keep tabs in your library and return to them later.",
  },
  {
    question: "Is this useful as an AI guitar tab editor?",
    answer:
      "Yes. AI-generated tabs open as fully editable projects. The editor is also a complete standalone tab-making workspace, so transcription is an optional starting point rather than a requirement.",
  },
  {
    question: "What kinds of tabs can I make online?",
    answer:
      "You can write riffs, solos, chord progressions, fingerstyle parts, lesson exercises, cover song sections, and full guitar arrangements directly in the browser.",
  },
] as const;

export default function EditorLandingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignedIn = Boolean(session?.user?.id);
  const editorDescription =
    "Create, arrange, play, practise, and organize guitar tabs in a complete browser-based editor. Start from a blank tab, import a file, or bring in a Note2Tabs transcription.";
  const editorJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": EDITOR_APPLICATION_ID,
      name: "Note2Tabs Online Guitar Tab Maker and Editor",
      applicationCategory: "MusicApplication",
      operatingSystem: "Web",
      url: absoluteUrl("/editor"),
      description: editorDescription,
      isPartOf: { "@id": WEBSITE_ID },
      provider: { "@id": ORGANIZATION_ID },
      hasPart: { "@id": absoluteUrl("/features#collection") },
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
      setError(err?.message || "We could not start a new tab. Check your connection and try again.");
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

      <main className="editor-v2">
        <section className="editor-v2-hero">
          <div className="container editor-v2-hero-grid">
            <div className="editor-v2-hero-copy">
              <span className="editor-v2-kicker">Free browser-based editor</span>
              <h1>Make guitar tabs that feel good to play.</h1>
              <p>{editorDescription}</p>
              <div className="editor-v2-actions">
                <button type="button" onClick={() => void handleCreate()} className="button-primary" disabled={creating}>
                  {creating ? "Starting..." : "Start a blank tab"}
                </button>
                <Link href={LIBRARY_PATH} className="button-secondary">
                  Open library
                </Link>
              </div>
              <div className="editor-v2-proof" aria-label="Editor highlights">
                <span>No installation</span>
                <span>Guest mode</span>
                <span>30+ guitar-specific tools</span>
              </div>
              {error && <div className="error editor-landing-error" role="alert">{error}</div>}
            </div>

            <div className="editor-v2-hero-visual" aria-label="Preview of the Note2Tabs guitar tab editor">
              <div className="editor-v2-window">
                <div className="editor-v2-window-bar" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <em>note2tabs.com/editor</em>
                </div>
                <Image
                  src="/images/editor-previews/Editor-main.webp"
                  alt="Note2Tabs guitar tab editor showing a song arranged into editable sections"
                  width={1897}
                  height={949}
                  priority
                  sizes="(max-width: 900px) calc(100vw - 36px), 54vw"
                />
              </div>
              <div className="editor-v2-float editor-v2-float--top">30+ editing tools</div>
              <div className="editor-v2-float editor-v2-float--bottom">Play · loop · practise</div>
            </div>
          </div>
        </section>

        <section className="editor-v2-feature-strip" aria-label="What you can edit">
          <div className="container editor-v2-feature-grid">
            {editAreas.map((area, index) => (
              <article key={area.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{area.title}</h2>
                  <p>{area.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="editor-v2-showcase">
          <div className="container editor-v2-showcase-stack">
            <article className="editor-v2-showcase-row">
              <div className="editor-v2-showcase-copy">
                <span className="editor-v2-kicker">Built for guitar decisions</span>
                <h2>Choose the fingering—not just the note.</h2>
                <p>
                  The same pitch can live in several places on the fretboard. Compare positions, choose realistic chord
                  shapes, snap ideas to a key, and keep phrases in a hand position that makes musical sense.
                </p>
                <ul>
                  <li><Link href="/features/guitar-tab-fingering-optimizer">Automatic fingering suggestions</Link></li>
                  <li><Link href="/features/guitar-tab-fingering-optimizer">String and fret optimization</Link></li>
                  <li>Chord shapes and playing coordinates</li>
                </ul>
                <Link href="/features" className="editor-v2-showcase-link">
                  Explore all guitar tab editor features <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="editor-v2-showcase-image editor-v2-showcase-image--tools">
                <Image
                  src="/images/editor-previews/collage.webp"
                  alt="Guitar-focused editing tools for fingerings, chords, and fretboard positions"
                  width={822}
                  height={604}
                  sizes="(max-width: 820px) calc(100vw - 36px), 48vw"
                />
              </div>
            </article>

            <article className="editor-v2-showcase-row editor-v2-showcase-row--reverse">
              <div className="editor-v2-showcase-copy">
                <span className="editor-v2-kicker">Edit and practise together</span>
                <h2>Hear it, loop it, learn it.</h2>
                <p>
                  Write a tab yourself or open one created by the transcriber, then play it with guitar sounds, loop
                  difficult sections, and use train mode to build speed gradually.
                </p>
                <ul>
                  <li>Section-based playback</li>
                  <li><Link href="/features/guitar-tab-practice-trainer">Practice loops and speed training</Link></li>
                  <li>Import audio or YouTube transcriptions</li>
                </ul>
              </div>
              <div className="editor-v2-showcase-image editor-v2-showcase-image--training">
                <Image
                  src="/images/editor-previews/collage-training.webp"
                  alt="Playback, looping, and speed-training tools in the guitar tab editor"
                  width={1242}
                  height={772}
                  sizes="(max-width: 820px) calc(100vw - 36px), 48vw"
                />
              </div>
            </article>
          </div>
        </section>

        <section className="editor-v2-steps">
          <div className="container">
            <div className="editor-v2-section-heading">
              <span className="editor-v2-kicker">Simple workflow</span>
              <h2>From first note to playable tab.</h2>
            </div>
            <div className="editor-v2-step-grid">
              {editorSteps.map((step, index) => (
                <article key={step.title}>
                  <span>{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
            <div className="editor-v2-paths">
              <Link href="/ai-guitar-tab-generator">
                <span>Have a recording?</span>
                <strong>Create a guitar tab with AI →</strong>
              </Link>
              <Link href="/audio-to-guitar-tab-converter">
                <span>Have an MP3 or WAV?</span>
                <strong>Convert audio to tab →</strong>
              </Link>
              <button type="button" onClick={() => void handleCreate()} disabled={creating}>
                <span>Already know the part?</span>
                <strong>Start from a blank tab →</strong>
              </button>
            </div>
          </div>
        </section>

        <section className="editor-v2-faq">
          <div className="container editor-v2-faq-grid">
            <div className="editor-v2-section-heading">
              <span className="editor-v2-kicker">Before you start</span>
              <h2>Questions, answered.</h2>
              <p>Guest mode opens immediately. Create an account only when you want to save your work.</p>
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

        <section className="editor-v2-cta">
          <div className="container editor-v2-cta-card">
            <div>
              <span className="editor-v2-kicker">Your next riff starts here</span>
              <h2>Open a blank tab. Make it yours.</h2>
              <p>No installation and no account required to begin.</p>
            </div>
            <button type="button" onClick={() => void handleCreate()} className="button-primary" disabled={creating}>
              {creating ? "Starting..." : "Start creating free"}
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
