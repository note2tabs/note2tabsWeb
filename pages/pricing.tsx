import Head from "next/head";
import Link from "next/link";

export default function PricingPage() {
  return (
    <>
      <Head>
        <title>Pricing | Note2Tabs</title>
        <meta
          name="description"
          content="Simple monthly pricing for Note2Tabs. Compare free and premium plans for guitar tab transcription and editing."
        />
        <meta property="og:title" content="Pricing | Note2Tabs" />
        <meta
          property="og:description"
          content="Simple monthly pricing for Note2Tabs. Compare free and premium plans for guitar tab transcription and editing."
        />
        <meta name="twitter:title" content="Pricing | Note2Tabs" />
        <meta
          name="twitter:description"
          content="Simple monthly pricing for Note2Tabs. Compare free and premium plans for guitar tab transcription and editing."
        />
      </Head>
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
              <Link href="/#pricing" className="button-secondary button-small">
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
