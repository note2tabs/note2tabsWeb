import Link from "next/link";
import SeoHead, { ORGANIZATION_ID, WEBSITE_ID, absoluteUrl } from "../components/SeoHead";
import { DEFAULT_AFFILIATE_TERMS } from "../lib/affiliate";

const steps = [
  {
    number: "01",
    title: "Accept your invitation",
    text: "Affiliate access is invitation-only. Sign in with the Note2Tabs account named in your invitation, then connect Stripe for payouts.",
  },
  {
    number: "02",
    title: "Share your link or code",
    text: "Use your personal referral link in content, descriptions, messages, or resources. Your promotion code can also be entered at checkout.",
  },
  {
    number: "03",
    title: "Follow results",
    text: "Your dashboard shows attributed customers, pending commissions, paid commissions, and the date each commission becomes available.",
  },
] as const;

const faq = [
  {
    question: "Which subscriptions qualify?",
    answer: "Affiliate attribution applies to eligible Note2Tabs Premium and Pro subscriptions. Commission is calculated from the amount the customer actually pays after discounts.",
  },
  {
    question: "How is a customer attributed?",
    answer: `A visit through your referral link stores your code for up to ${DEFAULT_AFFILIATE_TERMS.cookieDays} days. A customer can also enter your promotion code at checkout. Note2Tabs records the attributed account and its qualifying payments in your dashboard.`,
  },
  {
    question: "When are commissions paid?",
    answer: `A commission remains pending for ${DEFAULT_AFFILIATE_TERMS.payoutHoldDays} days to allow for refunds and disputes. After that hold, eligible commissions are sent through Stripe once your payout account is complete. Your bank's processing time may vary.`,
  },
  {
    question: "What happens after a refund or dispute?",
    answer: "The commission connected to that payment is reversed. If it has already been transferred, Stripe may reverse the corresponding transfer.",
  },
  {
    question: "Do I need to handle customer billing or support?",
    answer: "No. Note2Tabs handles checkout, subscriptions, billing, and product support. Send customers with account or product questions to support@note2tabs.com.",
  },
  {
    question: "Can an affiliate account be deactivated?",
    answer: "Yes. Deactivation stops the referral link and promotion code from creating new attributed sales. Valid commissions earned before deactivation remain payable under their existing terms.",
  },
] as const;

export default function AffiliateProgramPage() {
  const title = "Note2Tabs Affiliate Program";
  const description =
    "Learn how the invite-only Note2Tabs affiliate program works, including standard commission terms, tracking, payouts, and promotion guidelines.";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url: absoluteUrl("/affiliate-program"),
      description,
      isPartOf: { "@id": WEBSITE_ID },
      about: { "@id": ORGANIZATION_ID },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];

  return (
    <>
      <SeoHead title={title} description={description} canonicalPath="/affiliate-program" jsonLd={jsonLd} />
      <main className="affiliateInfoPage">
        <div className="affiliateInfoShell">
          <header className="affiliateInfoHero">
            <p className="affiliateInfoKicker">Affiliate program</p>
            <h1>Recommend a useful tool.<br />Earn when musicians subscribe.</h1>
            <p className="affiliateInfoIntro">
              Note2Tabs affiliates share a personal link or promotion code and earn commission from qualifying
              subscriptions. The program is currently invite-only so we can support each partner properly.
            </p>
            <div className="affiliateInfoActions">
              <Link className="affiliateInfoPrimary" href="/affiliate">Open affiliate dashboard</Link>
              <a className="affiliateInfoSecondary" href="mailto:support@note2tabs.com?subject=Note2Tabs%20affiliate%20partnership">
                Ask about partnering
              </a>
            </div>
          </header>

          <section className="affiliateInfoTerms" aria-labelledby="standard-terms-heading">
            <div className="affiliateInfoTermsIntro">
              <p className="affiliateInfoLabel">Standard program terms</p>
              <h2 id="standard-terms-heading">Simple terms, visible in your dashboard.</h2>
              <p>Your invitation may contain custom terms. If it does, the terms displayed in your affiliate dashboard apply.</p>
            </div>
            <dl>
              <div><dt>You earn</dt><dd>{DEFAULT_AFFILIATE_TERMS.commissionPercent}%</dd><span>of qualifying payments</span></div>
              <div><dt>Commission period</dt><dd>{DEFAULT_AFFILIATE_TERMS.commissionMonths}</dd><span>qualifying payments</span></div>
              <div><dt>Customer saves</dt><dd>{DEFAULT_AFFILIATE_TERMS.discountPercent}%</dd><span>at checkout</span></div>
              <div><dt>Discount period</dt><dd>{DEFAULT_AFFILIATE_TERMS.discountMonths}</dd><span>billing periods</span></div>
            </dl>
          </section>

          <section className="affiliateInfoSection" aria-labelledby="how-it-works-heading">
            <div className="affiliateInfoSectionHeading">
              <p className="affiliateInfoLabel">How it works</p>
              <h2 id="how-it-works-heading">From invitation to payout</h2>
            </div>
            <div className="affiliateInfoSteps">
              {steps.map((step) => (
                <article key={step.number}>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="affiliateInfoSplit">
            <article>
              <p className="affiliateInfoLabel">What to share</p>
              <h2>Explain the product honestly.</h2>
              <p>
                Note2Tabs turns uploaded audio and supported YouTube links into editable guitar tablature. Users can
                review the result in the browser, correct notes, practise sections, and export their work.
              </p>
              <ul>
                <li>Use your unique link wherever links are supported.</li>
                <li>Include your promotion code when a link is impractical.</li>
                <li>Make the affiliate relationship clear to your audience.</li>
                <li>Describe transcription as a starting point that users can edit, not a guaranteed perfect result.</li>
              </ul>
            </article>
            <article>
              <p className="affiliateInfoLabel">Program guidelines</p>
              <h2>Protect your audience and the program.</h2>
              <ul>
                <li>No spam, misleading claims, impersonation, or undisclosed paid promotion.</li>
                <li>No self-referrals, fake accounts, coupon-site dumping, or attempts to manipulate attribution.</li>
                <li>Do not promise prices, discounts, features, or results that Note2Tabs does not offer.</li>
                <li>Follow the advertising, privacy, and disclosure rules that apply in your location and channel.</li>
              </ul>
              <p className="affiliateInfoFinePrint">
                Abuse can lead to deactivation and review of affected commissions. See the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.
              </p>
            </article>
          </section>

          <section className="affiliateInfoSection affiliateInfoFaq" aria-labelledby="affiliate-faq-heading">
            <div className="affiliateInfoSectionHeading">
              <p className="affiliateInfoLabel">Details</p>
              <h2 id="affiliate-faq-heading">Common questions</h2>
            </div>
            <div className="affiliateInfoFaqList">
              {faq.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}<span aria-hidden="true">+</span></summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="affiliateInfoClosing">
            <div>
              <p className="affiliateInfoLabel">Already invited?</p>
              <h2>Your link, terms, and earnings are waiting.</h2>
            </div>
            <Link className="affiliateInfoPrimary" href="/affiliate">Go to your dashboard</Link>
          </section>
        </div>
      </main>
    </>
  );
}
