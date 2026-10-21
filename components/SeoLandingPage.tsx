import { useLocale } from "../lib/i18n/react";
import Link from "./LocaleLink";
import Image from "next/image";
import { trackCtaClick } from "../lib/analytics";
import SeoHead, { ORGANIZATION_ID, SITE_NAME, WEBSITE_ID, absoluteUrl } from "./SeoHead";

type SeoLandingPageProps = {
  title: string;
  metaTitle: string;
  description: string;
  canonicalPath: string;
  hasTranslation?: boolean;
  preview?: { src: string; width: number; height: number; alt: string; label: string };
  primaryCta: {
    label: string;
    href: string;
  };
  secondaryCta?: {
    label: string;
    href: string;
  };
  steps: Array<{
    title: string;
    body: string;
  }>;
  detail?: {
    title: string;
    paragraphs: string[];
    benefits?: Array<{ title: string; body: string }>;
  };
  contentSections?: Array<{
    title: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
  faqs?: Array<{ question: string; answer: string }>;
  relatedLinks?: Array<{
    label: string;
    href: string;
    description: string;
  }>;
};

export default function SeoLandingPage({
  title,
  metaTitle,
  description,
  canonicalPath,
  hasTranslation = true,
  preview,
  primaryCta,
  secondaryCta,
  steps,
  detail,
  contentSections = [],
  faqs = [],
  relatedLinks = [],
}: SeoLandingPageProps) {
  const { t } = useLocale();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url: absoluteUrl(canonicalPath),
      description,
      isPartOf: {
        "@id": WEBSITE_ID,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "MusicApplication",
      operatingSystem: "Web",
      url: absoluteUrl(canonicalPath),
      description,
      isPartOf: { "@id": WEBSITE_ID },
      provider: { "@id": ORGANIZATION_ID },
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
          name: title,
          item: absoluteUrl(canonicalPath),
        },
      ],
    },
    ...(faqs.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: { "@type": "Answer", text: faq.answer },
            })),
          },
        ]
      : []),
  ];

  const editorFirst = primaryCta.href.startsWith("/gte/new");
  const sourceLabel = canonicalPath.includes("youtube") ? "YouTube"
    : canonicalPath.includes("mp3") ? "MP3"
    : editorFirst ? "Guitar tab editor" : "Audio";
  const trackAction = (href: string, placement: string) => trackCtaClick(
    href.startsWith("/gte/") ? "seo_editor" : "seo_transcribe",
    { surface: "seo_landing", destination: href, placement, landing_path: canonicalPath },
  );
  const primaryAction = (placement: string) => <Link href={primaryCta.href} className="search-landing-primary"
    onClick={() => trackAction(primaryCta.href, placement)}>
    {t(primaryCta.label)} <span aria-hidden="true">→</span>
  </Link>;

  return (
    <>
      <SeoHead title={t(metaTitle)} description={description} canonicalPath={canonicalPath} hasTranslation={hasTranslation} jsonLd={jsonLd} />
      <main className="search-landing">
        <div className="container search-landing-shell">
          <section className="search-landing-hero" aria-labelledby="search-landing-title">
            <div className="search-landing-intro">
              <p className="search-landing-kicker">Note2Tabs <span aria-hidden="true">/</span> {t(preview?.label || sourceLabel)}</p>
              <h1 id="search-landing-title">{t(title)}</h1>
              <p className="search-landing-description">{t(description)}</p>
              <div className="search-landing-actions">
                {primaryAction("search_hero")}
                <span className="search-landing-note">{t(editorFirst ? "Guest mode" : "Free to try")}</span>
              </div>
              {secondaryCta && <Link href={secondaryCta.href} className="search-landing-alternative"
                onClick={() => trackAction(secondaryCta.href, "search_alternative")}>
                {t(secondaryCta.label)} <span aria-hidden="true">↗</span>
              </Link>}
            </div>
            <figure className="search-landing-preview">
              <div className="search-landing-preview-label">
                <span>{t(preview?.label || "Guitar tab editor")}</span><span aria-hidden="true" dir="ltr">01 — 02</span>
              </div>
              <div className="search-landing-score">
                <Image src={preview?.src || "/images/editor-previews/search-editor.png"} width={preview?.width || 790} height={preview?.height || 170}
                  alt={t(preview?.alt || "Example tab in the Note2Tabs editor")}
                  priority sizes="(max-width: 800px) 100vw, 650px" />
              </div>
              <figcaption><span>{t("Write, arrange, play, and practice")}</span><span dir="ltr">TXT · MIDI · MusicXML</span></figcaption>
            </figure>
          </section>

          <section className="search-landing-workflow" aria-labelledby="search-workflow-title">
            <h2 id="search-workflow-title">{t("How it works")}</h2>
            <ol>{steps.map((step, index) => <li key={step.title}>
              <span className="search-landing-step-number" aria-hidden="true">0{index + 1}</span>
              <div><h3>{t(step.title)}</h3><p>{t(step.body)}</p></div>
            </li>)}</ol>
          </section>

          <div className="search-landing-reference">
            {detail && <section className="search-landing-detail"><h2>{t(detail.title)}</h2>
              {detail.paragraphs.map(paragraph => <p key={paragraph}>{t(paragraph)}</p>)}
              {detail.benefits?.length ? <ul className="search-landing-benefits">{detail.benefits.map(benefit => <li key={benefit.title}><strong>{t(benefit.title)}</strong> {t(benefit.body)}</li>)}</ul> : null}
            </section>}
            {contentSections.map(section => <section className="search-landing-detail" key={section.title}>
              <h2>{t(section.title)}</h2>
              {section.paragraphs.map(paragraph => <p key={paragraph}>{t(paragraph)}</p>)}
              {section.bullets?.length ? <ul>{section.bullets.map(bullet => <li key={bullet}>{t(bullet)}</li>)}</ul> : null}
            </section>)}
          </div>

          {faqs.length > 0 && <section className="search-landing-faq" aria-labelledby="search-faq-title">
            <h2 id="search-faq-title">{t("Frequently asked questions")}</h2>
            <div>{faqs.map(faq => <details key={faq.question}>
              <summary>{t(faq.question)}<span aria-hidden="true">+</span></summary><p>{t(faq.answer)}</p>
            </details>)}</div>
          </section>}

          <section className="search-landing-next" aria-label={t(primaryCta.label)}>
            {primaryAction("search_end")}<Link href="/pricing">{t("Plans and pricing")} <span aria-hidden="true">↗</span></Link>
          </section>
          <nav className="search-landing-related" aria-label={t("Related guides and tools")}>
            {relatedLinks.map(link => <Link href={link.href} key={link.href}>{t(link.label)} <span aria-hidden="true">↗</span></Link>)}
          </nav>
        </div>
      </main>
    </>
  );
}
