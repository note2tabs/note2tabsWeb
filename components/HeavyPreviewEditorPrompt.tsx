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
    <aside className="heavy-preview-editor-prompt" aria-label="Continue with Heavy">
      <button
        type="button"
        className="heavy-preview-editor-prompt__close"
        onClick={onClose}
        aria-label="Dismiss Premium message"
      >
        ×
      </button>
      <div className="heavy-preview-editor-prompt__copy">
        <strong>Your Heavy preview is ready</strong>
        <p>Continue using Heavy with Premium or Pro.</p>
      </div>
      <div className="heavy-preview-editor-prompt__actions">
        <button type="button" className="button-primary button-small" onClick={onUpgrade}>View plans</button>
        <button type="button" className="heavy-preview-editor-prompt__later" onClick={onClose}>
          Continue editing
        </button>
      </div>
    </aside>
  );
}
