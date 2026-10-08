import { useLocale } from "../lib/i18n/react";
import Link from "../components/LocaleLink";
import NoIndexHead from "../components/NoIndexHead";

export default function NotFoundPage() {
  const { t } = useLocale();
  return (
    <>
      <NoIndexHead title={t("Page not found | Note2Tabs")} canonicalPath="/404" description="This Note2Tabs page could not be found." />
      <main className="page recovery-page">
        <div className="container recovery-card">
          <p className="hero-eyebrow">{t("404 — wrong fret")}</p>
          <h1>{t("That page is out of tune.")}</h1>
          <p>{t("The link may be old, or the page may have moved. Your next riff is still close by.")}</p>
          <div className="button-row">
            <Link href="/" className="button-primary">{t("Go home")}</Link>
            <Link href="/transcribe" className="button-secondary">{t("Open transcriber")}</Link>
            <Link href="/editor" className="button-secondary">{t("Try the editor")}</Link>
          </div>
        </div>
      </main>
    </>
  );
}
