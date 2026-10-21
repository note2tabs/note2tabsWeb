import Link from "./LocaleLink";
import { useLocale } from "../lib/i18n/react";
import { trackCtaClick } from "../lib/analytics";
import { getSeoFeaturePage, type SeoFeaturePage } from "../lib/seoFeaturePages";

/** A format reference first; keep the next step close to the useful information. */
export default function ImportExportFeature({ page }: { page: SeoFeaturePage }) {
  const { t } = useLocale();
  const trackEditor = (placement: string) => trackCtaClick("feature_editor", {
    surface: "feature", feature_slug: page.slug, destination: "/gte/new", placement,
  });
  return <main className="import-export-page">
    <div className="container import-export-content">
      <nav className="import-export-breadcrumb" aria-label={t("Breadcrumb")}>
        <Link href="/editor">{t("Guitar tab editor")}</Link><span aria-hidden="true">/</span><Link href="/features">{t("Features")}</Link>
      </nav>
      <header className="import-export-header">
        <h1>{t(page.title)}</h1>
        <p>{t(page.description)}</p>
        <Link href="/gte/new" className="button-primary" onClick={() => trackEditor("feature_intro")}>
          {t("Open the editor")} <span aria-hidden="true">→</span>
        </Link>
        <small>{t("Open the editor in guest mode, then sign in only when you want to save your work.")}</small>
      </header>
      <section className="import-export-formats" aria-labelledby="format-reference-title">
        <h2 id="format-reference-title">{t("Supported formats")}</h2>
        <div className="import-export-table-scroll">
          <table>
            <thead><tr><th scope="col">{t("Format")}</th><th scope="col">{t("Import")}</th><th scope="col">{t("Export")}</th></tr></thead>
            <tbody>
              {[
                ["ASCII tab", ".txt, .tab, .asc", ".txt"],
                ["MusicXML", ".musicxml, .xml, .mxl", ".musicxml"],
                ["MIDI", ".mid, .midi", ".mid"],
                ["Guitar Pro", ".gp, .gp3, .gp4, .gp5, .gpx, .gtp", "—"],
                ["Note2Tabs JSON", ".json", ".note2tabs.json"],
              ].map(([name, imports, exports]) => <tr key={name}><th scope="row">{t(name)}</th><td>{imports}</td><td>{exports}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <ol className="import-export-workflow">
        {page.steps.map(step => <li key={step.title}><h2>{t(step.title)}</h2><p>{t(step.body)}</p></li>)}
      </ol>
      <div className="import-export-details">
        {page.contentSections.map(section => <section key={section.title}>
          <h2>{t(section.title)}</h2>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{t(paragraph)}</p>)}
        </section>)}
      </div>
      <section className="import-export-faq" aria-label={t("FAQs")}>
        {page.faqs.map(faq => <details key={faq.question}><summary>{t(faq.question)}</summary><p>{t(faq.answer)}</p></details>)}
      </section>
      <nav className="import-export-related" aria-label={t("Related features")}>
        <Link href="/bass-tab-editor">{t("Bass tab editor")} <span aria-hidden="true">→</span></Link>
        {page.relatedSlugs.map(slug => {
          const related = getSeoFeaturePage(slug);
          return related ? <Link key={slug} href={`/features/${slug}`}>{t(related.title)} <span aria-hidden="true">→</span></Link> : null;
        })}
      </nav>
      <footer className="import-export-next">
        <Link href="/gte/new" className="button-primary" onClick={() => trackEditor("feature_end")}>{t("Open the editor")} <span aria-hidden="true">→</span></Link>
        <Link href="/transcribe" className="button-link" onClick={() => trackCtaClick("feature_transcribe", { surface: "feature", feature_slug: page.slug, destination: "/transcribe", placement: "feature_end" })}>{t("Transcribe audio to tabs")}</Link>
        <Link href="/features" className="button-link">{t("View all features →")}</Link>
      </footer>
    </div>
  </main>;
}
