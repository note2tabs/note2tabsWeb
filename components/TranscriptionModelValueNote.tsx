import { useLocale } from "../lib/i18n/react";
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
  const { t } = useLocale();
  if (model === "light") {
    return (
      <p className={`model-value-note${isPremium ? "" : " model-value-note--premium"}`}>
        <span>
          {isPremium
            ? t("Working with a complex recording? Heavy offers our highest accuracy.")
            : t("Need more accuracy? The Heavy model is available with Premium or Pro.")}
        </span>
        <button type="button" onClick={onSelectHeavy} className="model-value-note__action">
          {isPremium ? t("Use Heavy") : t("See plans")}
        </button>
      </p>
    );
  }

  if (model === "super_heavy") {
    return (
      <p className="model-value-note">
        {heavyPreviewAvailable
          ? t("Your verified account includes one 30-second Heavy preview. It is available once; subscribe for continued Heavy access.")
          : t("Heavy uses our most detailed model for complex multi-instrument transcription.")}
      </p>
    );
  }

  return (
    <p className="model-value-note">
      <span>{t("Light selected for multi-instrument transcription.")}</span>
    </p>
  );
}
