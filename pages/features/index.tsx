import { useLocale } from "../../lib/i18n/react";
import Image from "next/image";
import Link from "../../components/LocaleLink";
import SeoHead, { EDITOR_APPLICATION_ID, WEBSITE_ID, absoluteUrl } from "../../components/SeoHead";
import { SEO_OPPORTUNITY_CONTENT_LAST_MODIFIED, seoFeaturePages } from "../../lib/seoFeaturePages";

const featureLabels = [
  "Playability",
  "Music theory",
  "Rhythm guitar",
  "Fast editing",
  "File workflow",
  "Practice",
];

export default function FeaturesPage() {
  const { t } = useLocale();
  const description =
    "Explore the Note2Tabs guitar tab editor: optimize fingerings, detect keys, build chord tracks, edit faster, import files, and practice difficult sections.";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": absoluteUrl("/features#collection"),
      name: "Note2Tabs Guitar Tab Editor Features",
      url: absoluteUrl("/features"),
      description,
      dateModified: SEO_OPPORTUNITY_CONTENT_LAST_MODIFIED,
      isPartOf: { "@id": WEBSITE_ID },
      about: { "@id": EDITOR_APPLICATION_ID },
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
        { "@type": "ListItem", position: 2, name: "Guitar Tab Editor", item: absoluteUrl("/editor") },
        { "@type": "ListItem", position: 3, name: "Features", item: absoluteUrl("/features") },
      ],
    },
  ];

  return (
    <>
      <SeoHead
        title={t("Guitar Tab Editor Tools & Features | Note2Tabs")}
        description={description}
        canonicalPath="/features"
        jsonLd={jsonLd}
      />
      <main className="features-hub">
        <section className="features-hub-hero">
          <div className="container features-hub-hero-grid">
            <div className="features-hub-hero-copy">
              <nav className="feature-story-breadcrumb features-hub-breadcrumb" aria-label={t("Breadcrumb")}>
                <Link href="/editor">{t("Guitar tab editor")}</Link>
                <span aria-hidden="true">{t("/")}</span>
                <span>{t("Features")}</span>
              </nav>
              <span className="features-hub-kicker">{t("Inside the editor")}</span>
              <h1>{t("Tools for the decisions guitar tabs actually need.")}</h1>
              <p>
                {t("Go beyond placing fret numbers. Shape fingerings, harmony, rhythm, file workflows, and practice—all inside the same browser-based editor.")}</p>
              <div className="feature-story-actions">
                <Link href="/editor" className="button-primary">{t("Try the editor free")}</Link>
                <Link href="/transcribe" className="button-secondary">{t("Create a tab from audio")}</Link>
              </div>
            </div>
            <div className="features-hub-visual">
              <div className="features-hub-window">
                <div className="feature-story-window-bar" aria-hidden="true">
                  <i /><i /><i /><span>{t("One workspace, from first note to practice")}</span>
                </div>
                <Image
                  src="/images/editor-previews/Editor-main.webp"
                  alt={t("The Note2Tabs guitar tab editor with tracks and editing controls")}
                  width={1897}
                  height={949}
                  priority
                  sizes="(max-width: 900px) calc(100vw - 32px), 54vw"
                />
              </div>
              <div className="features-hub-visual-note features-hub-visual-note--one">{t("30+ editing tools")}</div>
              <div className="features-hub-visual-note features-hub-visual-note--two">{t("Write · refine · practise")}</div>
            </div>
          </div>
        </section>

        <section className="features-hub-intro">
          <div className="container features-hub-intro-grid">
            <span>{t("Six focused toolsets")}</span>
            <h2>{t("Everything stays connected to the tab.")}</h2>
            <p>
              {t("Each tool solves a different part of the workflow, but none of them sends you to a separate project. Write a note, choose its fingering, hear it, and practise it in context.")}</p>
          </div>
        </section>

        <section className="features-hub-library" aria-labelledby="feature-library-title">
          <div className="container">
            <div className="features-hub-library-heading">
              <div><span className="features-hub-kicker">{t("Explore the toolkit")}</span><h2 id="feature-library-title">{t("Choose where you want more control.")}</h2></div>
              <p>{t("Start with a feature or open the full editor and discover the tools as you work.")}</p>
            </div>
            <div className="features-hub-grid">
              {seoFeaturePages.map((page, index) => (
                <Link href={`/features/${page.slug}`} className={`features-hub-card features-hub-card--${index + 1}`} key={page.slug}>
                  <div className="features-hub-card-top"><span>{t("0")}{index + 1}</span><em>{t(featureLabels[index])}</em></div>
                  <h3>{t(page.title)}</h3>
                  <p>{t(page.description)}</p>
                  <strong>{t("Explore this feature ")}<span aria-hidden="true">{t("→")}</span></strong>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="features-hub-path">
          <div className="container features-hub-path-grid">
            <article><span>{t("01")}</span><h2>{t("Create from sound")}</h2><p>{t("Turn audio or a YouTube segment into an editable guitar tab.")}</p><Link href="/transcribe">{t("Open the transcriber →")}</Link></article>
            <article><span>{t("02")}</span><h2>{t("Build in the editor")}</h2><p>{t("Write and arrange notes, positions, chords, techniques, and song structure.")}</p><Link href="/editor">{t("Open the editor →")}</Link></article>
            <article><span>{t("03")}</span><h2>{t("Practise your tab")}</h2><p>{t("Loop difficult bars, slow playback down, and build toward full speed.")}</p><Link href="/features/guitar-tab-practice-trainer">{t("Explore practice tools →")}</Link></article>
          </div>
        </section>

        <section className="feature-story-cta features-hub-cta">
          <div className="container feature-story-cta-card">
            <div><span>{t("A complete guitar workspace")}</span><h2>{t("Write from scratch or start from audio.")}</h2><p>{t("The editor stands on its own, while the transcriber gives you another powerful way to begin. No installation required.")}</p></div>
            <div className="feature-story-actions">
              <Link href="/editor" className="button-primary">{t("Try the editor free")}</Link>
              <Link href="/transcribe" className="button-secondary">{t("Transcribe a song")}</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
