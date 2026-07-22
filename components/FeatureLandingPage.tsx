import Image from "next/image";
import Link from "next/link";
import { getSeoFeaturePage, type SeoFeaturePage } from "../lib/seoFeaturePages";
import SeoHead, { ORGANIZATION_ID, SITE_NAME, WEBSITE_ID, absoluteUrl } from "./SeoHead";

type FeatureVisual = {
  image: string;
  imageAlt: string;
  tone: string;
  label: string;
  headline: string;
  note: string;
};

const featureVisuals: Record<string, FeatureVisual> = {
  "guitar-tab-fingering-optimizer": {
    image: "/images/editor-previews/collage.webp",
    imageAlt: "Fingering and fretboard-position tools in the Note2Tabs guitar tab editor",
    tone: "sage",
    label: "Fretboard-aware",
    headline: "Same pitch. Better position.",
    note: "Compare playable alternatives before committing to a fingering.",
  },
  "guitar-tab-key-detector": {
    image: "/images/editor-previews/Editor-main.webp",
    imageAlt: "Key detection and scale controls in the Note2Tabs guitar tab editor",
    tone: "blue",
    label: "Music theory, in context",
    headline: "Find the key. Keep the flow.",
    note: "Detect a likely scale, then snap or step notes without leaving the tab.",
  },
  "guitar-chord-strumming-editor": {
    image: "/images/editor-previews/collage.webp",
    imageAlt: "Chord diagrams and strumming controls in the Note2Tabs editor",
    tone: "sand",
    label: "Rhythm guitar",
    headline: "Shape the chord and the feel.",
    note: "Keep voicings, diagrams, timing, and individual strokes together.",
  },
  "guitar-tab-editor-shortcuts": {
    image: "/images/editor-previews/Editor-main.webp",
    imageAlt: "A guitar tab project open in the Note2Tabs browser editor",
    tone: "slate",
    label: "Faster editing",
    headline: "Hear a problem. Fix it quickly.",
    note: "Shortcuts keep repeated note, timing, technique, and section edits moving.",
  },
  "guitar-tab-import-export": {
    image: "/images/editor-previews/Editor-main.webp",
    imageAlt: "Imported tracks arranged inside the Note2Tabs guitar tab editor",
    tone: "peach",
    label: "Open workflow",
    headline: "Bring the tab. Keep editing.",
    note: "Move between common tab formats without retyping the arrangement.",
  },
  "guitar-tab-practice-trainer": {
    image: "/images/editor-previews/collage-training.webp",
    imageAlt: "Looping and speed-training tools in the Note2Tabs guitar tab editor",
    tone: "mint",
    label: "Practice mode",
    headline: "Loop less. Learn more.",
    note: "Isolate difficult bars and build speed inside the same project you edit.",
  },
};

export default function FeatureLandingPage({ page }: { page: SeoFeaturePage }) {
  const visual = featureVisuals[page.slug] || featureVisuals["guitar-tab-editor-shortcuts"];
  const relatedPages = page.relatedSlugs
    .map((slug) => getSeoFeaturePage(slug))
    .filter((related): related is SeoFeaturePage => Boolean(related));
  const canonicalPath = `/features/${page.slug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.title,
      url: absoluteUrl(canonicalPath),
      description: page.description,
      isPartOf: {
        "@type": "CollectionPage",
        "@id": absoluteUrl("/features#collection"),
        name: "Note2Tabs Guitar Tab Editor Features",
        url: absoluteUrl("/features"),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "MusicApplication",
      operatingSystem: "Web",
      url: absoluteUrl(canonicalPath),
      description: page.description,
      isPartOf: { "@id": WEBSITE_ID },
      provider: { "@id": ORGANIZATION_ID },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Features", item: absoluteUrl("/features") },
        { "@type": "ListItem", position: 3, name: page.title, item: absoluteUrl(canonicalPath) },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ];

  return (
    <>
      <SeoHead title={page.metaTitle} description={page.description} canonicalPath={canonicalPath} jsonLd={jsonLd} />
      <main className={`feature-story feature-story--${visual.tone}`}>
        <section className="feature-story-hero">
          <div className="container feature-story-hero-grid">
            <div className="feature-story-hero-copy">
              <nav className="feature-story-breadcrumb" aria-label="Breadcrumb">
                <Link href="/features">Editor features</Link>
                <span aria-hidden="true">/</span>
                <span>{visual.label}</span>
              </nav>
              <h1>{page.title}</h1>
              <p>{page.description}</p>
              <div className="feature-story-actions">
                <Link href="/editor" className="button-primary">Try the editor free</Link>
                <Link href="/transcribe" className="button-secondary">Transcribe audio to tabs</Link>
              </div>
              <div className="feature-story-proof" aria-label="Product highlights">
                <span>Runs in your browser</span>
                <span>Guest mode available</span>
                <span>Editable results</span>
              </div>
            </div>

            <div className="feature-story-visual">
              <div className="feature-story-window">
                <div className="feature-story-window-bar" aria-hidden="true">
                  <i /><i /><i />
                  <span>note2tabs.com/editor</span>
                </div>
                <Image
                  src={visual.image}
                  alt={visual.imageAlt}
                  width={visual.image.includes("training") ? 1242 : visual.image.includes("collage") ? 822 : 1897}
                  height={visual.image.includes("training") ? 772 : visual.image.includes("collage") ? 604 : 949}
                  priority
                  sizes="(max-width: 900px) calc(100vw - 32px), 52vw"
                />
              </div>
              <aside className="feature-story-callout">
                <span>{visual.label}</span>
                <strong>{visual.headline}</strong>
                <p>{visual.note}</p>
              </aside>
            </div>
          </div>
        </section>

        <section className="feature-story-steps" aria-labelledby="feature-workflow-title">
          <div className="container">
            <div className="feature-story-section-heading">
              <span>One focused workflow</span>
              <h2 id="feature-workflow-title">From first input to a playable result.</h2>
            </div>
            <div className="feature-story-step-grid">
              {page.steps.map((step, index) => (
                <article key={step.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="feature-story-overview">
          <div className="container feature-story-overview-grid">
            <div className="feature-story-overview-copy">
              <span className="feature-story-kicker">Built around the instrument</span>
              <h2>{page.detail.title}</h2>
              {page.detail.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <div className="feature-story-benefits">
              {page.detail.benefits.map((benefit, index) => (
                <article key={benefit.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><h3>{benefit.title}</h3><p>{benefit.body}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="feature-story-details">
          <div className="container feature-story-detail-list">
            {page.contentSections.map((section, index) => (
              <article className="feature-story-detail" key={section.title}>
                <div className="feature-story-detail-index">0{index + 1}</div>
                <div className="feature-story-detail-copy">
                  <h2>{section.title}</h2>
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
                {section.bullets?.length ? (
                  <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                ) : (
                  <div className="feature-story-detail-mark" aria-hidden="true"><span /><span /><span /></div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="feature-story-faq">
          <div className="container feature-story-faq-grid">
            <div className="feature-story-section-heading">
              <span>Good to know</span>
              <h2>Questions before you start.</h2>
              <p>Open the editor in guest mode, then sign in only when you want to save your work.</p>
            </div>
            <div className="feature-story-faq-list">
              {page.faqs.map((faq) => (
                <details key={faq.question}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="feature-story-related">
          <div className="container">
            <div className="feature-story-related-heading">
              <div><span className="feature-story-kicker">Keep exploring</span><h2>More ways to shape a better tab.</h2></div>
              <Link href="/features">View all features →</Link>
            </div>
            <div className="feature-story-related-grid">
              {relatedPages.map((related, index) => (
                <Link href={`/features/${related.slug}`} key={related.slug}>
                  <span>0{index + 1}</span>
                  <h3>{related.title}</h3>
                  <p>{related.description}</p>
                  <strong>Explore feature →</strong>
                </Link>
              ))}
              <Link href="/editor">
                <span>03</span>
                <h3>Online guitar tab editor</h3>
                <p>Open a blank tab or continue refining a transcription in your browser.</p>
                <strong>Open the editor →</strong>
              </Link>
            </div>
          </div>
        </section>

        <section className="feature-story-cta">
          <div className="container feature-story-cta-card">
            <div><span>Ready when you are</span><h2>Make the next tab easier to play.</h2><p>Start blank or bring in a transcription draft. No installation required.</p></div>
            <div className="feature-story-actions">
              <Link href="/editor" className="button-primary">Try the editor free</Link>
              <Link href="/transcribe" className="button-secondary">Start with audio</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
