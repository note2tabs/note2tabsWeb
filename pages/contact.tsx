import { useLocale } from "../lib/i18n/react";
import SeoHead, { ORGANIZATION_ID, WEBSITE_ID, absoluteUrl } from "../components/SeoHead";

export default function ContactPage() {
  const { t } = useLocale();
  const description =
    "Contact Note2Tabs for product questions, bug reports, account issues, and support.";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      name: "Contact Note2Tabs",
      url: absoluteUrl("/contact"),
      description,
      isPartOf: { "@id": WEBSITE_ID },
      about: { "@id": ORGANIZATION_ID },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Contact", item: absoluteUrl("/contact") },
      ],
    },
  ];

  return (
    <>
      <SeoHead
        title={t("Contact Note2Tabs")}
        description={description}
        canonicalPath="/contact"
        jsonLd={jsonLd}
      />
      <main className="page legal-page">
        <div className="legal-shell">
          <header className="legal-header">
            <p className="legal-kicker">{t("Contact")}</p>
            <h1 className="page-title">{t("Get in touch with Note2Tabs")}</h1>
            <p className="page-subtitle">
              {t("Product questions, bug reports, or account issues. We read every message.")}</p>
          </header>

          <section className="legal-prose">
            <h2>{t("Email")}</h2>
            <p>
              {t("Reach us at ")}<a href="mailto:support@note2tabs.com"><strong>{t("support@note2tabs.com")}</strong></a>{t(".")}</p>
            <p>
              {t("Including your account email and a short description of the issue helps us respond faster.")}</p>

            <h2>{t("Support scope")}</h2>
            <ul>
              <li>{t("Billing and subscription questions")}</li>
              <li>{t("Transcription workflow issues")}</li>
              <li>{t("Editor and saved-tab problems")}</li>
              <li>{t("General product and feature questions")}</li>
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
