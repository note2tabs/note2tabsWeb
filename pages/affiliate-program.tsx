import AffiliateApplicationForm from "../components/AffiliateApplicationForm";
import { AFFILIATE_PAYOUT_NOTICE } from "../lib/affiliatePayoutPolicy";
import { useLocale } from "../lib/i18n/react";
import Link from "../components/LocaleLink";
import SeoHead, { ORGANIZATION_ID, WEBSITE_ID, absoluteUrl } from "../components/SeoHead";
import { DEFAULT_AFFILIATE_TERMS } from "../lib/affiliate";

const faq = [
  {
    question: "Who can become an affiliate?",
    answer:
      "Apply using the form below. We review each application and invite partners whose audiences would benefit from Note2Tabs.",
  },
  {
    question: "What counts as a referral?",
    answer: "Your personal link stores your code for up to {days} days. Your audience can also enter your code at checkout. Eligible Premium and Pro subscription payments are then attributed to you.",
  },
  {
    question: "How and when do I get paid?",
    answer: "Payouts are handled through Stripe. Commissions remain pending for {days} days to account for refunds and disputes, then become eligible for payout once your Stripe account is complete.",
  },
  {
    question: "Can my offer be different?",
    answer:
      "Yes. The figures on this page are our standard program terms. Some partners receive custom commission or customer-discount terms, which will always be shown in their dashboard.",
  },
] as const;

export default function AffiliateProgramPage() {
  const { t } = useLocale();
  const title = "Note2Tabs Affiliate Program";
  const description =
    "Earn commission by introducing guitarists to Note2Tabs. See the standard affiliate offer, how referrals work, and how to request an invitation.";
  const translatedFaq = faq.map(item => ({...item, answer: t(item.answer, {days: item.question === "What counts as a referral?" ? DEFAULT_AFFILIATE_TERMS.cookieDays : DEFAULT_AFFILIATE_TERMS.payoutHoldDays}) + (item.question === "How and when do I get paid?" ? " " + t(AFFILIATE_PAYOUT_NOTICE) : "")}));
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
      mainEntity: translatedFaq.map((item) => ({
        "@type": "Question",
        name: t(item.question),
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];

  return (
    <>
      <SeoHead title={t(title)} description={description} canonicalPath="/affiliate-program" jsonLd={jsonLd} />
      <main className="affiliateInfoPage">
        <div className="affiliateInfoShell">
          <header className="affiliateInfoHero affiliateInfoHero--sales">
            <p className="affiliateInfoKicker">{t("Note2Tabs affiliate program")}</p>
            <h1>{t("Help guitarists find better tabs. Earn when they subscribe.")}</h1>
            <p className="affiliateInfoIntro">
              {t("Recommend Note2Tabs to your audience with a personal link and discount code. You earn commission; they save on a tool that turns music into editable guitar tabs.")}</p>
            <div className="affiliateInfoActions">
              <a className="affiliateInfoPrimary" href="#affiliate-application">{t("Apply to become an affiliate")}</a>
              <Link className="affiliateInfoSecondary" href="/affiliate">{t("Affiliate sign in")}</Link>
            </div>
            <p className="affiliateInfoInviteNote">{t("Applications are reviewed individually.")}</p>
          </header>

          <section className="affiliateInfoOffer" aria-labelledby="affiliate-offer-heading">
            <div className="affiliateInfoOfferLead">
              <p className="affiliateInfoLabel">{t("The standard offer")}</p>
              <h2 id="affiliate-offer-heading">{t("A useful offer for both sides.")}</h2>
              <p>{t("Custom terms may be offered to selected partners. Your dashboard always shows the terms that apply to you.")}</p>
            </div>
            <article>
              <strong>{DEFAULT_AFFILIATE_TERMS.commissionPercent}{t("%")}</strong>
              <h3>{t("You earn")}</h3>
              <p>{t("Commission on a referred customer’s first {count} qualifying payments.", {count: DEFAULT_AFFILIATE_TERMS.commissionMonths})}</p>
            </article>
            <article>
              <strong>{DEFAULT_AFFILIATE_TERMS.discountPercent}{t("%")}</strong>
              <h3>{t("Your audience saves")}</h3>
              <p>{t("On their first {count} billing periods with your code.", {count: DEFAULT_AFFILIATE_TERMS.discountMonths})}</p>
            </article>
          </section>

          <section className="affiliateInfoSection affiliateInfoHow" aria-labelledby="how-it-works-heading">
            <div className="affiliateInfoSectionHeading">
              <p className="affiliateInfoLabel">{t("How it works")}</p>
              <h2 id="how-it-works-heading">{t("Three simple steps")}</h2>
            </div>
            <ol className="affiliateInfoSimpleSteps">
              <li><span>{t("1")}</span><div><h3>{t("Get invited")}</h3><p>{t("We create your affiliate account and confirm your offer.")}</p></div></li>
              <li><span>{t("2")}</span><div><h3>{t("Share Note2Tabs")}</h3><p>{t("Use your personal link or discount code in content your audience trusts.")}</p></div></li>
              <li><span>{t("3")}</span><div><h3>{t("Track and earn")}</h3><p>{t("See referrals and commissions in your dashboard. Stripe handles payouts.")}</p></div></li>
            </ol>
          </section>

          <section className="affiliateInfoFit">
            <div>
              <p className="affiliateInfoLabel">{t("A natural fit for")}</p>
              <h2>{t("People who already help musicians.")}</h2>
            </div>
            <ul>
              <li>{t("Guitar teachers and music schools")}</li>
              <li>{t("YouTube, TikTok, and Instagram creators")}</li>
              <li>{t("Music blogs, newsletters, and communities")}</li>
              <li>{t("Artists who share tutorials or learning resources")}</li>
            </ul>
          </section>

          <section className="affiliateInfoProduct">
            <div>
              <p className="affiliateInfoLabel">{t("What you are recommending")}</p>
              <h2>{t("Audio and YouTube to editable guitar tabs.")}</h2>
            </div>
            <p>
              {t("Note2Tabs helps guitarists turn songs into tablature they can edit, practise, and export. It is useful for learning a difficult part, preparing lesson material, or getting a first draft without tabbing a song from scratch.")}</p>
          </section>

          <section className="affiliateInfoSection affiliateInfoFaq" aria-labelledby="affiliate-faq-heading">
            <div className="affiliateInfoSectionHeading">
              <p className="affiliateInfoLabel">{t("Good to know")}</p>
              <h2 id="affiliate-faq-heading">{t("Program details")}</h2>
            </div>
            <div className="affiliateInfoFaqList">
              {translatedFaq.map((item) => (
                <details key={item.question}>
                  <summary>{t(item.question)}<span aria-hidden="true">{t("+")}</span></summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <AffiliateApplicationForm />

          <p className="affiliateInfoProgramNote">
            {t("Please promote Note2Tabs honestly, disclose your affiliate relationship, and do not use spam, self-referrals, misleading claims, or coupon-site dumping. Refunds and disputes reverse the related commission. See our ")}<Link href="/terms">{t("Terms")}</Link> {t(" and ")}<Link href="/privacy">{t("Privacy Policy")}</Link>{t(".")}</p>
        </div>
      </main>
    </>
  );
}
