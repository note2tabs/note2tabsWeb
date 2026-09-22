import type { TranscriptionModelChoice } from "../lib/transcriptionModels";

type TranscriptionModelValueNoteProps = {
  model: TranscriptionModelChoice;
  isPremium: boolean;
  onSelectHeavy: () => void;
  surface: string;
};

export default function TranscriptionModelValueNote({
  model,
  onSelectHeavy,
}: TranscriptionModelValueNoteProps) {
  if (model === "light") {
    return (
      <p className="model-value-note">
        <span>
          Working with a complex recording? Try Medium for multi-instrument transcription.
        </span>
        <button type="button" onClick={onSelectHeavy} className="model-value-note__action">
          Try Medium
        </button>
      </p>
    );
  }

  if (model === "super_heavy") {
    return <p className="model-value-note">Heavy uses our most detailed model for complex multi-instrument transcription.</p>;
  }

  return (
    <p className="model-value-note">
      <span>Medium selected for multi-instrument transcription.</span>
    </p>
  );
}
