import Link from "next/link";
import SeoHead, { SITE_NAME, absoluteUrl } from "./SeoHead";

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
  faqs?: Array<{ question: string; answer: string }>;
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
  faqs = [],
}: SeoLandingPageProps) {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url: absoluteUrl(canonicalPath),
      description,
      isPartOf: {
        "@type": "WebSite",
        name: SITE_NAME,
        url: absoluteUrl("/"),
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
      <SeoHead title={metaTitle} description={description} canonicalPath={canonicalPath} jsonLd={jsonLd} />
      <main className="page page-home">
        <section className="hero editor-landing-hero">
          <div className="container hero-stack hero-stack--centered editor-landing-shell">
            <div className="hero-heading">
              <div className="hero-title-row">
                <h1 className="hero-title">{title}</h1>
              </div>
              <p className="hero-subtitle editor-landing-subtitle">{description}</p>
              <div className="button-row hero-cta-row editor-landing-hero-actions">
                <Link href={primaryCta.href} className="button-primary">
                  {primaryCta.label}
                </Link>
                {secondaryCta && (
                  <Link href={secondaryCta.href} className="button-secondary">
                    {secondaryCta.label}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="steps">
          <div className="container">
            <h2 className="section-title">How it works</h2>
            <div className="how-flow">
              {steps.map((step, index) => (
                <article className="how-step" key={step.title}>
                  <span className="how-step-index">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {detail && (
          <section className="seo-landing-detail">
            <div className="container seo-landing-detail-layout">
              <div className="seo-landing-copy">
                <h2>{detail.title}</h2>
                {detail.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <div className="seo-landing-benefits">
                {detail.benefits.map((benefit) => (
                  <article key={benefit.title}>
                    <h3>{benefit.title}</h3>
                    <p>{benefit.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {faqs.length > 0 && (
          <section className="seo-landing-faq">
            <div className="container seo-landing-faq-layout">
              <div>
                <span className="pill">Questions</span>
                <h2>Frequently asked questions</h2>
              </div>
              <div className="seo-landing-faq-list">
                {faqs.map((faq) => (
                  <details key={faq.question}>
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="seo-landing-related">
          <div className="container">
            <h2>Keep creating</h2>
            <div className="seo-landing-related-links">
              <Link href="/transcribe">Audio transcriber</Link>
              <Link href="/editor">Guitar tab editor</Link>
              <Link href="/pricing">Plans and limits</Link>
              <Link href="/blog">Guitar tab guides</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
