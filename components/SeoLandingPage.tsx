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
};

export default function SeoLandingPage({
  title,
  metaTitle,
  description,
  canonicalPath,
  primaryCta,
  secondaryCta,
  steps,
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
      </main>
    </>
  );
}
