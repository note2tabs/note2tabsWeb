import { useLocale } from "../lib/i18n/react";
import SeoHead from "../components/SeoHead";

export default function TermsPage() {
  const { t } = useLocale();
  return (
    <>
      <SeoHead
        title={t("Terms of Service | Note2Tabs")}
        description="Read the Note2Tabs terms for accounts, user content, generated tablature, acceptable use, payments, and service availability."
        canonicalPath="/terms"
      />
      <main className="page legal-page">
        <div className="legal-shell">
          <header className="legal-header">
            <p className="legal-kicker">{t("Legal")}</p>
            <h1 className="page-title">{t("Terms of Service")}</h1>
            <p className="page-subtitle">{t("Last updated: October 2026")}</p>
          </header>

          <section className="legal-prose">
          <p>
            {t("These Terms govern your use of Note2Tabs. By using the service you agree to these Terms. If you do not agree, do not use the service.")}</p>

          <h2>{t("1. What Note2Tabs provides")}</h2>
          <p>
            {t("Note2Tabs is a tool for creating, editing, and managing guitar tablature. The service may also allow users to upload audio for automatic tablature generation.")}</p>
          <p>
            {t("Generated tablature is approximate and may contain mistakes. It is intended as a practice and editing aid only. We may modify or discontinue features at any time.")}</p>

          <h2>{t("2. Accounts")}</h2>
          <p>{t("You are responsible for your account and login credentials.")}</p>
          <p>{t("We may suspend or terminate accounts that violate these Terms or abuse the service.")}</p>
          <p>{t("You must be at least 13 years old to use the service.")}</p>

          <h2>{t("3. User content")}</h2>
          <p>
            {t("You own the files and tablature you create or upload. As between you and Note2Tabs, you retain all right, title, and interest in your content. We do not claim ownership of your tabs.")}</p>
          <p>{t("When you upload audio, you give Note2Tabs permission to:")}</p>
          <ul>
            <li>{t("store it temporarily")}</li>
            <li>{t("process it")}</li>
            <li>{t("analyze it to produce tablature")}</li>
          </ul>
          <p>
            {t("You grant Note2Tabs a limited, non-exclusive license to host, process, and display your content solely to operate and improve the service, provide support, and comply with legal obligations.")}</p>
          <p>{t("Files may be automatically deleted after processing.")}</p>
          <p>{t("You must have permission to upload the audio.")}</p>

          <h2>{t("4. Copyright responsibility")}</h2>
          <p>
            {t("You are solely responsible for the material you upload and for ensuring you have the necessary rights to create or share it. If you create original tabs, you own the copyright in that original expression, subject to any underlying rights in the music.")}</p>
          <p>{t("Do not upload:")}</p>
          <ul>
            <li>{t("copyrighted recordings you do not have rights to")}</li>
            <li>{t("illegal material")}</li>
            <li>{t("private recordings without consent")}</li>
          </ul>
          <p>{t("We do not verify ownership of uploaded audio.")}</p>
          <p>{t("Copyright removal requests: legal@note2tabs.com")}</p>

          <h2>{t("5. Generated tablature")}</h2>
          <p>
            {t("Tabs created using the service may be used personally or commercially. We do not guarantee accuracy or legal clearance for distribution or commercial use. You are responsible for securing any necessary licenses, permissions, and clearances and for how you use exported tablature.")}</p>

          <h2>{t("6. Acceptable use")}</h2>
          <ul>
            <li>{t("Do not attempt to copy or extract internal processing methods")}</li>
            <li>{t("Do not overload or attack the servers")}</li>
            <li>{t("Do not bypass usage limits")}</li>
            <li>{t("Do not automate bulk requests")}</li>
            <li>{t("Do not use the service to build competing products")}</li>
          </ul>

          <h2>{t("7. Payments")}</h2>
          <p>{t("Some features require payment.")}</p>
          <p>{t("Subscriptions renew automatically until cancelled.")}</p>
          <p>{t("Fees are non refundable except where required by law.")}</p>
          <p>{t("We may change pricing with notice.")}</p>

          <h2>{t("8. Ownership")}</h2>
          <p>{t("The service software, design, and branding belong to Note2Tabs.")}</p>
          <p>{t("You keep ownership of your own music and created tabs.")}</p>
          <p>{t("You receive permission to use the service outputs personally.")}</p>

          <h2>{t("9. Service availability")}</h2>
          <p>
            {t("The service is provided as is. We do not guarantee uptime, successful processing, accurate results, or permanent storage.")}</p>

          <h2>{t("10. Liability")}</h2>
          <p>
            {t("Note2Tabs is not responsible for incorrect tablature, lost files, copyright misuse by users, or service interruptions.")}</p>
          <p>{t("Liability is limited to the amount you paid in the past 12 months.")}</p>

          <h2>{t("11. Termination")}</h2>
          <p>{t("We may suspend or terminate access at any time for violations or abuse.")}</p>

          <h2>{t("12. Governing law")}</h2>
          <p>{t("These Terms are governed by the laws of Sweden.")}</p>

          <h2>{t("13. Company information and contact")}</h2>
          <p>
            {t("Note2Tabs is operated by ")}<strong>{t("Note2Tabs AB")}</strong>{t(", a Swedish private limited company (aktiebolag).")}</p>
          <p>
            {t("Co-founders and website representatives: ")}<strong>{t("Noel Solomon")}</strong> {t(" and ")}<strong>{t("Aron Salamon")}</strong>
          </p>
          <p>
            {t("Registered address:")}<br />
            {t("Telegrafgatan 5")}<br />
            {t("169 72 Solna")}<br />
            {t("Sweden")}</p>
          <p>
            {t("Email: ")}<a href="mailto:support@note2tabs.com">{t("support@note2tabs.com")}</a>
          </p>
          </section>
        </div>
      </main>
    </>
  );
}
