import { useLocale } from "../lib/i18n/react";
import Link from "../components/LocaleLink";
import NoIndexHead from "../components/NoIndexHead";

export default function ServerErrorPage() {
  const { t } = useLocale();
  return (
    <>
      <NoIndexHead title={t("Something went wrong | Note2Tabs")} canonicalPath="/500" description="Note2Tabs hit a temporary error." />
      <main className="page recovery-page">
        <div className="container recovery-card">
          <p className="hero-eyebrow">{t("Temporary error")}</p>
          <h1>{t("We dropped a note.")}</h1>
          <p>{t("Try the page again. If the problem continues, return home and restart the flow.")}</p>
          <div className="button-row">
            <button type="button" className="button-primary" onClick={() => window.location.reload()}>{t("Try again")}</button>
            <Link href="/" className="button-secondary">{t("Go home")}</Link>
          </div>
        </div>
      </main>
    </>
  );
}
