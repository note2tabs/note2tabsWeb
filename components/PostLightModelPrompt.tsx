type PostLightModelPromptProps = {
  open: boolean;
  recommendation: "medium" | "heavy_preview";
  onClose: () => void;
  onTryAgain: () => void;
};

export default function PostLightModelPrompt({
  open,
  recommendation,
  onClose,
  onTryAgain,
}: PostLightModelPromptProps) {
  if (!open) return null;

  const isHeavyPreview = recommendation === "heavy_preview";

  return (
    <aside
      className="heavy-preview-editor-prompt post-light-model-prompt"
      aria-label={isHeavyPreview ? "Try the Heavy model" : "Try the Medium model"}
    >
      <button
        type="button"
        className="heavy-preview-editor-prompt__close"
        onClick={onClose}
        aria-label="Dismiss model recommendation"
      >
        ×
      </button>
      <div className="heavy-preview-editor-prompt__copy">
        <strong>{isHeavyPreview ? "Want our best accuracy?" : "Want more accuracy?"}</strong>
        <p>
          {isHeavyPreview
            ? "This tab used our Light model. You have one free 30-second preview of our most accurate model."
            : "This tab used our Light model. Medium is better suited to complex recordings and multiple instruments."}
        </p>
      </div>
      <div className="heavy-preview-editor-prompt__actions">
        <button type="button" className="button-primary button-small" onClick={onTryAgain}>
          {isHeavyPreview ? "Try Heavy free" : "Try Medium"}
        </button>
        <button type="button" className="heavy-preview-editor-prompt__later" onClick={onClose}>
          Continue editing
        </button>
      </div>
      {isHeavyPreview && (
        <small className="heavy-preview-editor-prompt__reassurance">
          One preview per account · No credits used
        </small>
      )}
    </aside>
  );
}
