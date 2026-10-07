import type { TranscriptionModelChoice } from "../lib/transcriptionModels";

type TranscriptionModelValueNoteProps = {
  model: TranscriptionModelChoice;
  isPremium: boolean;
  onSelectHeavy: () => void;
  surface: string;
  heavyPreviewAvailable?: boolean;
};

export default function TranscriptionModelValueNote({
  model,
  isPremium,
  onSelectHeavy,
  heavyPreviewAvailable = false,
}: TranscriptionModelValueNoteProps) {
  if (model === "light") {
    return (
      <p className={`model-value-note${isPremium ? "" : " model-value-note--premium"}`}>
        <span>
          {isPremium
            ? "Working with a complex recording? Heavy offers our highest accuracy."
            : "Need more accuracy? The Heavy model is available with Premium or Pro."}
        </span>
        <button type="button" onClick={onSelectHeavy} className="model-value-note__action">
          {isPremium ? "Use Heavy" : "See plans"}
        </button>
      </p>
    );
  }

  if (model === "super_heavy") {
    return (
      <p className="model-value-note">
        {heavyPreviewAvailable
          ? "Your verified account includes one 30-second Heavy preview. It is available once; subscribe for continued Heavy access."
          : "Heavy uses our most detailed model for complex multi-instrument transcription."}
      </p>
    );
  }

  return (
    <p className="model-value-note">
      <span>Light selected for multi-instrument transcription.</span>
    </p>
  );
}
