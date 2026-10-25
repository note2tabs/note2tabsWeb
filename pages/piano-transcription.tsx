import { useLocale } from "../lib/i18n/react";
import { localizeInstrumentPage } from "../lib/i18n/instruments";
import TranscriberPage from "./transcriber";
import { instrumentSeoPages } from "../lib/instrumentSeoPages";

export default function PianoTranscriptionPage() {
  const {locale} = useLocale();
  return <TranscriberPage initialInstrument="piano" landingPage={localizeInstrumentPage(instrumentSeoPages["piano-transcription"], locale)} />;
}
