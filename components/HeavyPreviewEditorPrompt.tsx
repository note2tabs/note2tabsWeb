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
  if (!open) return null;

  return (
    <aside className="heavy-preview-editor-prompt" aria-label="Keep using the Heavy model">
      <button
        type="button"
        className="heavy-preview-editor-prompt__close"
        onClick={onClose}
        aria-label="Dismiss Heavy model offer"
      >
        ×
      </button>
      <div className="heavy-preview-editor-prompt__copy">
        <strong>Keep using the Heavy model</strong>
        <p>Your preview used our most accurate model. Continue using it with Premium or Pro.</p>
      </div>
      <div className="heavy-preview-editor-prompt__actions">
        <button type="button" className="button-primary button-small" onClick={onUpgrade}>View plans</button>
        <button type="button" className="heavy-preview-editor-prompt__later" onClick={onClose}>
          Continue editing
        </button>
      </div>
      <small className="heavy-preview-editor-prompt__reassurance">Plans from $5.99/month · Cancel anytime</small>
    </aside>
  );
}
