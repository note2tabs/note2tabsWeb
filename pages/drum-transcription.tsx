import SeoLandingPage from "../components/SeoLandingPage";
import { instrumentSeoPages } from "../lib/instrumentSeoPages";
export default function InstrumentPage() {
  return <SeoLandingPage {...instrumentSeoPages["drum-transcription"]} />;
}
