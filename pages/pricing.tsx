import Link from "next/link";
import { useEffect } from "react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import SeoHead, { absoluteUrl } from "../components/SeoHead";

export default function PricingPage() {
  const description =
    "Simple monthly pricing for Note2Tabs. Compare free and premium plans for guitar tab transcription and editing.";
  const pricingJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Note2Tabs Pricing",
      url: absoluteUrl("/pricing"),
      description,
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
          name: "Pricing",
          item: absoluteUrl("/pricing"),
        },
      ],
    },
  ];

  useEffect(() => {
    sendEvent(ANALYTICS_EVENTS.pricingViewed, { path: "/pricing" });
  }, []);

  return (
    <>
      <SeoHead title="Pricing | Note2Tabs" description={description} canonicalPath="/pricing" jsonLd={pricingJsonLd} />
      <main className="page">
        <section className="pricing">
          <div className="container stack">
            <div className="page-header">
              <div>
                <h1 className="page-title">Pricing</h1>
                <p className="page-subtitle">
                  Compare Free and Premium plans for credits, speed, ads, and upload limits.
                </p>
              </div>
              <Link
                href="/#pricing"
                className="button-secondary button-small"
                onClick={() => trackCtaClick("pricing_back_to_app", { surface: "pricing_page" })}
              >
                Back to app
              </Link>
            </div>

            <div className="pricing-grid">
              <div className="pricing-card pricing-card--free">
                <div className="pricing-header">
                  <div>
                    <h3>Free</h3>
                    <p className="muted text-small">Core features with lower limits.</p>
                  </div>
                  <div className="pricing-price">
                    <span className="pricing-amount">$0</span>
                    <span className="pricing-interval">/ month</span>
                  </div>
                </div>
                <ul className="pricing-list">
                  <li>Ads enabled</li>
                  <li>10 credits per month</li>
                  <li>Standard speed</li>
                  <li>Upload size 50 MB</li>
                </ul>
              </div>

              <div className="pricing-card pricing-card--premium pricing-card--trial">
                <span className="pricing-trial-ribbon">7 days free trial</span>
                <div className="pricing-header">
                  <div>
                    <h3>Premium</h3>
                    <p className="muted text-small">Higher limits with faster processing.</p>
                  </div>
                  <div className="pricing-price">
                    <span className="pricing-amount">$5.99</span>
                    <span className="pricing-interval">/ month</span>
                  </div>
                </div>
                <ul className="pricing-list">
                  <li>No ads</li>
                  <li>50 credits per month (with rollover)</li>
                  <li>Extra speed</li>
                  <li>Upload size 200 MB</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
