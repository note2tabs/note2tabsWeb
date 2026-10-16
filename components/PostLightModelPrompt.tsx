import { useLocale } from "../lib/i18n/react";

type PostLightModelPromptProps = {
  open: boolean;
  recommendation: "heavy" | "heavy_preview";
  hasHeavyAccess?: boolean;
  onClose: () => void;
  onTryAgain: () => void;
};

export default function PostLightModelPrompt({
  open,
  recommendation,
  hasHeavyAccess = false,
  onClose,
  onTryAgain,
}: PostLightModelPromptProps) {
  const { t } = useLocale();
  if (!open) return null;

  const isHeavyPreview = recommendation === "heavy_preview";

  return (
    <aside
      className="heavy-preview-editor-prompt post-light-model-prompt"
      aria-label={t("Try the Heavy model")}
    >
      <button
        type="button"
        className="heavy-preview-editor-prompt__close"
        onClick={onClose}
        aria-label={t("Dismiss model recommendation")}
      >
        ×
      </button>
      <div className="heavy-preview-editor-prompt__copy">
        <strong>{isHeavyPreview ? t("Want our best accuracy?") : t("Get better accuracy!")}</strong>
        <p>
          {isHeavyPreview
            ? t("This tab used our Light model. You have one free 30-second preview of our most accurate model.")
            : t("This tab used our Light model. Heavy offers more detailed transcription for complex recordings and multiple instruments.")}
        </p>
      </div>
      <div className="heavy-preview-editor-prompt__actions">
        <button type="button" className="button-primary button-small" onClick={onTryAgain}>
          {isHeavyPreview ? t("Try Heavy free") : hasHeavyAccess ? t("Try Heavy") : t("See Heavy plans")}
        </button>
        <button type="button" className="heavy-preview-editor-prompt__later" onClick={onClose}>
          {t("Continue editing")}
        </button>
      </div>
      {isHeavyPreview && (
        <small className="heavy-preview-editor-prompt__reassurance">
          {t("One preview per account · No credits used")}
        </small>
      )}
    </aside>
  );
}
