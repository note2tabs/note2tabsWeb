import Image from "next/image";
import Link from "next/link";
import SeoHead, { SITE_NAME, absoluteUrl } from "../../components/SeoHead";
import { seoFeaturePages } from "../../lib/seoFeaturePages";

const featureLabels = [
  "Playability",
  "Music theory",
  "Rhythm guitar",
  "Fast editing",
  "File workflow",
  "Practice",
];

export default function FeaturesPage() {
  const description =
    "Explore the Note2Tabs guitar tab editor: optimize fingerings, detect keys, build chord tracks, edit faster, import files, and practice difficult sections.";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Note2Tabs Guitar Tab Editor Features",
      url: absoluteUrl("/features"),
      description,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absoluteUrl("/") },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: seoFeaturePages.map((page, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: page.title,
          url: absoluteUrl(`/features/${page.slug}`),
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Features", item: absoluteUrl("/features") },
      ],
    },
  ];

  return (
    <>
      <SeoHead
        title="Guitar Tab Editor Features | Note2Tabs"
        description={description}
        canonicalPath="/features"
        jsonLd={jsonLd}
      />
      <main className="features-hub">
        <section className="features-hub-hero">
          <div className="container features-hub-hero-grid">
            <div className="features-hub-hero-copy">
              <span className="features-hub-kicker">Inside the editor</span>
              <h1>Tools for the decisions guitar tabs actually need.</h1>
              <p>
                Go beyond placing fret numbers. Shape fingerings, harmony, rhythm, file workflows, and practice—all
                inside the same browser-based editor.
              </p>
              <div className="feature-story-actions">
                <Link href="/editor" className="button-primary">Try the editor free</Link>
                <Link href="/transcribe" className="button-secondary">Create a tab from audio</Link>
              </div>
            </div>
            <div className="features-hub-visual">
              <div className="features-hub-window">
                <div className="feature-story-window-bar" aria-hidden="true">
                  <i /><i /><i /><span>One workspace, from draft to practice</span>
                </div>
                <Image
                  src="/images/editor-previews/Editor-main.webp"
                  alt="The Note2Tabs guitar tab editor with tracks and editing controls"
                  width={1897}
                  height={949}
                  priority
                  sizes="(max-width: 900px) calc(100vw - 32px), 54vw"
                />
              </div>
              <div className="features-hub-visual-note features-hub-visual-note--one">30+ editing tools</div>
              <div className="features-hub-visual-note features-hub-visual-note--two">Write · refine · practise</div>
            </div>
          </div>
        </section>

        <section className="features-hub-intro">
          <div className="container features-hub-intro-grid">
            <span>Six focused toolsets</span>
            <h2>Everything stays connected to the tab.</h2>
            <p>
              Each tool solves a different part of the workflow, but none of them sends you to a separate project.
              Correct a note, change its fingering, hear it, and practise it in context.
            </p>
          </div>
        </section>

        <section className="features-hub-library" aria-labelledby="feature-library-title">
          <div className="container">
            <div className="features-hub-library-heading">
              <div><span className="features-hub-kicker">Explore the toolkit</span><h2 id="feature-library-title">Choose where you want more control.</h2></div>
              <p>Start with a feature or open the full editor and discover the tools as you work.</p>
            </div>
            <div className="features-hub-grid">
              {seoFeaturePages.map((page, index) => (
                <Link href={`/features/${page.slug}`} className={`features-hub-card features-hub-card--${index + 1}`} key={page.slug}>
                  <div className="features-hub-card-top"><span>0{index + 1}</span><em>{featureLabels[index]}</em></div>
                  <h3>{page.title}</h3>
                  <p>{page.description}</p>
                  <strong>Explore this feature <span aria-hidden="true">→</span></strong>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="features-hub-path">
          <div className="container features-hub-path-grid">
            <article><span>01</span><h2>Start with sound</h2><p>Turn audio or a YouTube segment into a draft you can inspect.</p><Link href="/transcribe">Open the transcriber →</Link></article>
            <article><span>02</span><h2>Make the guitar decisions</h2><p>Correct timing, positions, chords, techniques, and structure in the editor.</p><Link href="/editor">Open the editor →</Link></article>
            <article><span>03</span><h2>Practise the result</h2><p>Loop difficult bars, slow playback down, and build toward full speed.</p><Link href="/features/guitar-tab-practice-trainer">Explore practice tools →</Link></article>
          </div>
        </section>

        <section className="feature-story-cta features-hub-cta">
          <div className="container feature-story-cta-card">
            <div><span>One connected workflow</span><h2>Start with a blank tab or a generated draft.</h2><p>Use the complete editor in your browser. No installation required.</p></div>
            <div className="feature-story-actions">
              <Link href="/editor" className="button-primary">Try the editor free</Link>
              <Link href="/transcribe" className="button-secondary">Transcribe a song</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
