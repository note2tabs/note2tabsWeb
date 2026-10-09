import { useLocale } from "../lib/i18n/react";
export default function SkipLink() {
  const {t}=useLocale();
  return <a className="skip-link" href="#main-content">{t("Skip to main content")}</a>;
}
