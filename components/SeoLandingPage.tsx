import { useLocale } from "../lib/i18n/react";
import Link from "./LocaleLink";
import SeoHead, { ORGANIZATION_ID, SITE_NAME, WEBSITE_ID, absoluteUrl } from "./SeoHead";

type SeoLandingPageProps = {
  title: string;
  metaTitle: string;
  description: string;
  canonicalPath: string;
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
    benefits: Array<{ title: string; body: string }>;
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

  return (
    <>
      <SeoHead title={t(metaTitle)} description={description} canonicalPath={canonicalPath} jsonLd={jsonLd} />
      <main className="page page-home">
        <section className="hero editor-landing-hero">
          <div className="container hero-stack hero-stack--centered editor-landing-shell">
            <div className="hero-heading">
              <div className="hero-title-row">
                <h1 className="hero-title">{t(title)}</h1>
              </div>
              <p className="hero-subtitle editor-landing-subtitle">{t(description)}</p>
              <div className="button-row hero-cta-row editor-landing-hero-actions">
                <Link href={primaryCta.href} className="button-primary">
                  {t(primaryCta.label)}
                </Link>
                {secondaryCta && (
                  <Link href={secondaryCta.href} className="button-secondary">
                    {t(secondaryCta.label)}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="steps">
          <div className="container">
            <h2 className="section-title">{t("How it works")}</h2>
            <div className="how-flow">
              {steps.map((step, index) => (
                <article className="how-step" key={step.title}>
                  <span className="how-step-index">{index + 1}</span>
                  <h3>{t(step.title)}</h3>
                  <p>{t(step.body)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {detail && (
          <section className="seo-landing-detail">
            <div className="container seo-landing-detail-layout">
              <div className="seo-landing-copy">
                <h2>{t(detail.title)}</h2>
                {detail.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{t(paragraph)}</p>
                ))}
              </div>
              <div className="seo-landing-benefits">
                {detail.benefits.map((benefit) => (
                  <article key={benefit.title}>
                    <h3>{t(benefit.title)}</h3>
                    <p>{t(benefit.body)}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {contentSections.length > 0 && (
          <section className="seo-landing-content">
            <div className="container seo-landing-content-list">
              {contentSections.map((section) => (
                <article className="seo-landing-content-section" key={section.title}>
                  <h2>{t(section.title)}</h2>
                  <div>
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{t(paragraph)}</p>
                    ))}
                    {section.bullets && section.bullets.length > 0 && (
                      <ul>
                        {section.bullets.map((bullet) => (
                          <li key={bullet}>{t(bullet)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {faqs.length > 0 && (
          <section className="seo-landing-faq">
            <div className="container seo-landing-faq-layout">
              <div>
                <span className="pill">{t("Questions")}</span>
                <h2>{t("Frequently asked questions")}</h2>
              </div>
              <div className="seo-landing-faq-list">
                {faqs.map((faq) => (
                  <details key={faq.question}>
                    <summary>{t(faq.question)}</summary>
                    <p>{t(faq.answer)}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="seo-landing-related">
          <div className="container">
            <h2>{t(relatedLinks.length > 0 ? "Related guides and tools" : "Keep creating")}</h2>
            {relatedLinks.length > 0 ? (
              <div className="seo-landing-resource-grid">
                {relatedLinks.map((link) => (
                  <Link href={link.href} className="seo-landing-resource-card" key={link.href}>
                    <strong>{t(link.label)}</strong>
                    <span>{t(link.description)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="seo-landing-related-links">
                <Link href="/transcribe">{t("Audio transcriber")}</Link>
                <Link href="/editor">{t("Guitar tab editor")}</Link>
                <Link href="/pricing">{t("Plans and limits")}</Link>
                <Link href="/blog">{t("Guitar tab guides")}</Link>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
