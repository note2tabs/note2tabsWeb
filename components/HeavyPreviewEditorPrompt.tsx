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
      <div className="heavy-preview-editor-prompt__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4" />
        </svg>
      </div>
      <div className="heavy-preview-editor-prompt__copy">
        <span>Your Heavy preview is now in the editor</span>
        <strong>Want to use Heavy again?</strong>
        <p>Premium includes continued access to our most accurate transcription model.</p>
      </div>
      <div className="heavy-preview-editor-prompt__actions">
        <button type="button" className="button-primary button-small" onClick={onUpgrade}>
          See Premium
        </button>
        <button type="button" className="heavy-preview-editor-prompt__later" onClick={onClose}>
          Continue editing
        </button>
      </div>
    </aside>
  );
}
