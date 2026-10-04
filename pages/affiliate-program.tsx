import Link from "next/link";
import SeoHead, { ORGANIZATION_ID, WEBSITE_ID, absoluteUrl } from "../components/SeoHead";
import { DEFAULT_AFFILIATE_TERMS } from "../lib/affiliate";

const inviteEmail =
  "mailto:business@note2tabs.com?subject=Note2Tabs%20affiliate%20partnership&body=Tell%20us%20a%20little%20about%20your%20audience%20and%20where%20you%20would%20share%20Note2Tabs.";

const faq = [
  {
    question: "Who can become an affiliate?",
    answer:
      "The program is invite-only and best suited to guitar educators, creators, music communities, and others with an audience that would benefit from Note2Tabs. Email business@note2tabs.com to introduce yourself and your audience.",
  },
  {
    question: "What counts as a referral?",
    answer: `Your personal link stores your code for up to ${DEFAULT_AFFILIATE_TERMS.cookieDays} days. Your audience can also enter your code at checkout. Eligible Premium and Pro subscription payments are then attributed to you.`,
  },
  {
    question: "How and when do I get paid?",
    answer: `Payouts are handled through Stripe. Commissions remain pending for ${DEFAULT_AFFILIATE_TERMS.payoutHoldDays} days to account for refunds and disputes, then become eligible for payout once your Stripe account is complete.`,
  },
  {
    question: "Can my offer be different?",
    answer:
      "Yes. The figures on this page are our standard program terms. Some partners receive custom commission or customer-discount terms, which will always be shown in their dashboard.",
  },
] as const;

export default function AffiliateProgramPage() {
  const title = "Note2Tabs Affiliate Program";
  const description =
    "Earn commission by introducing guitarists to Note2Tabs. See the standard affiliate offer, how referrals work, and how to request an invitation.";
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
          <header className="affiliateInfoHero affiliateInfoHero--sales">
            <p className="affiliateInfoKicker">Note2Tabs affiliate program</p>
            <h1>Help guitarists find better tabs. Earn when they subscribe.</h1>
            <p className="affiliateInfoIntro">
              Recommend Note2Tabs to your audience with a personal link and discount code. You earn commission;
              they save on a tool that turns music into editable guitar tabs.
            </p>
            <div className="affiliateInfoActions">
              <a className="affiliateInfoPrimary" href={inviteEmail}>Request an invitation</a>
              <Link className="affiliateInfoSecondary" href="/affiliate">Affiliate sign in</Link>
            </div>
            <p className="affiliateInfoInviteNote">Invite-only · Tell us about your audience at <a href="mailto:business@note2tabs.com">business@note2tabs.com</a></p>
          </header>

          <section className="affiliateInfoOffer" aria-labelledby="affiliate-offer-heading">
            <div className="affiliateInfoOfferLead">
              <p className="affiliateInfoLabel">The standard offer</p>
              <h2 id="affiliate-offer-heading">A useful offer for both sides.</h2>
              <p>Custom terms may be offered to selected partners. Your dashboard always shows the terms that apply to you.</p>
            </div>
            <article>
              <strong>{DEFAULT_AFFILIATE_TERMS.commissionPercent}%</strong>
              <h3>You earn</h3>
              <p>Commission on a referred customer’s first {DEFAULT_AFFILIATE_TERMS.commissionMonths} qualifying payments.</p>
            </article>
            <article>
              <strong>{DEFAULT_AFFILIATE_TERMS.discountPercent}%</strong>
              <h3>Your audience saves</h3>
              <p>On their first {DEFAULT_AFFILIATE_TERMS.discountMonths} billing periods with your code.</p>
            </article>
          </section>

          <section className="affiliateInfoSection affiliateInfoHow" aria-labelledby="how-it-works-heading">
            <div className="affiliateInfoSectionHeading">
              <p className="affiliateInfoLabel">How it works</p>
              <h2 id="how-it-works-heading">Three simple steps</h2>
            </div>
            <ol className="affiliateInfoSimpleSteps">
              <li><span>1</span><div><h3>Get invited</h3><p>We create your affiliate account and confirm your offer.</p></div></li>
              <li><span>2</span><div><h3>Share Note2Tabs</h3><p>Use your personal link or discount code in content your audience trusts.</p></div></li>
              <li><span>3</span><div><h3>Track and earn</h3><p>See referrals and commissions in your dashboard. Stripe handles payouts.</p></div></li>
            </ol>
          </section>

          <section className="affiliateInfoFit">
            <div>
              <p className="affiliateInfoLabel">A natural fit for</p>
              <h2>People who already help musicians.</h2>
            </div>
            <ul>
              <li>Guitar teachers and music schools</li>
              <li>YouTube, TikTok, and Instagram creators</li>
              <li>Music blogs, newsletters, and communities</li>
              <li>Artists who share tutorials or learning resources</li>
            </ul>
          </section>

          <section className="affiliateInfoProduct">
            <div>
              <p className="affiliateInfoLabel">What you are recommending</p>
              <h2>Audio and YouTube to editable guitar tabs.</h2>
            </div>
            <p>
              Note2Tabs helps guitarists turn songs into tablature they can edit, practise, and export. It is useful
              for learning a difficult part, preparing lesson material, or getting a first draft without tabbing a
              song from scratch.
            </p>
          </section>

          <section className="affiliateInfoSection affiliateInfoFaq" aria-labelledby="affiliate-faq-heading">
            <div className="affiliateInfoSectionHeading">
              <p className="affiliateInfoLabel">Good to know</p>
              <h2 id="affiliate-faq-heading">Program details</h2>
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

          <section className="affiliateInfoClosing affiliateInfoClosing--invite">
            <div>
              <p className="affiliateInfoLabel">Interested in partnering?</p>
              <h2>Tell us about you and your audience.</h2>
              <p>We review partnerships individually and will reply with the next steps if there is a good fit.</p>
            </div>
            <a className="affiliateInfoPrimary" href={inviteEmail}>Email business@note2tabs.com</a>
          </section>

          <p className="affiliateInfoProgramNote">
            Please promote Note2Tabs honestly, disclose your affiliate relationship, and do not use spam,
            self-referrals, misleading claims, or coupon-site dumping. Refunds and disputes reverse the related
            commission. See our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </>
  );
}
