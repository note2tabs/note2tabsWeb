import Link from "next/link";
import { trackCtaClick } from "../lib/analytics";
import type { TranscriptionModelChoice } from "../lib/transcriptionModels";

type TranscriptionModelValueNoteProps = {
  model: TranscriptionModelChoice;
  isPremium: boolean;
  onSelectHeavy: () => void;
  surface: string;
};

export default function TranscriptionModelValueNote({
  model,
  isPremium,
  onSelectHeavy,
  surface,
}: TranscriptionModelValueNoteProps) {
  if (model === "light") {
    return (
      <p className="model-value-note">
        <span>
          Working with a complex recording? Heavy offers our highest accuracy.
        </span>
        <button type="button" onClick={onSelectHeavy}>
          Try Heavy
        </button>
      </p>
    );
  }

  if (isPremium) {
    return (
      <p className="model-value-note">
        <span>Heavy selected for our highest-accuracy transcription.</span>
      </p>
    );
  }

  return (
    <p className="model-value-note model-value-note--premium">
      <span>
        Prefer Heavy? Premium includes 10× more monthly credits for
        higher-accuracy transcriptions.
      </span>
      <Link
        href="/pricing"
        onClick={() => trackCtaClick("heavy_model_see_premium", { surface })}
      >
        See Premium
      </Link>
    </p>
  );
}
