import { useLocale } from "../lib/i18n/react";
import { localizeInstrumentPage } from "../lib/i18n/instruments";
import SeoLandingPage from "../components/SeoLandingPage";
import { instrumentSeoPages } from "../lib/instrumentSeoPages";
export default function InstrumentPage() {
  const {locale} = useLocale();
  return <SeoLandingPage {...localizeInstrumentPage(instrumentSeoPages["piano-sheet-music-editor"], locale)} />;
}
