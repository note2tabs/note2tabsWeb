import TranscriberPage from "./transcriber";
import { instrumentSeoPages } from "../lib/instrumentSeoPages";

export default function PianoTranscriptionPage() {
  return <TranscriberPage initialInstrument="piano" landingPage={instrumentSeoPages["piano-transcription"]} />;
}
