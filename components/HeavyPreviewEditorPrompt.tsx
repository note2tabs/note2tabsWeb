import { useLocale } from "../lib/i18n/react";

type HeavyPreviewEditorPromptProps = {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
};

export default function HeavyPreviewEditorPrompt({
  open,
  onClose,
  onUpgrade,
}: HeavyPreviewEditorPromptProps) {
  const { t } = useLocale();
  if (!open) return null;

  return (
    <aside className="heavy-preview-editor-prompt" aria-label={t("Keep using the Heavy model")}>
      <button
        type="button"
        className="heavy-preview-editor-prompt__close"
        onClick={onClose}
        aria-label={t("Dismiss Heavy model offer")}
      >
        ×
      </button>
      <div className="heavy-preview-editor-prompt__copy">
        <strong>{t("Keep using the Heavy model")}</strong>
        <p>{t("Your preview used our most accurate model. Continue using it with Premium or Pro.")}</p>
      </div>
      <div className="heavy-preview-editor-prompt__actions">
        <button type="button" className="button-primary button-small" onClick={onUpgrade}>{t("View plans")}</button>
        <button type="button" className="heavy-preview-editor-prompt__later" onClick={onClose}>
          {t("Continue editing")}
        </button>
      </div>
      <small className="heavy-preview-editor-prompt__reassurance">{t("Choose a plan. Cancel anytime.")}</small>
    </aside>
  );
}
