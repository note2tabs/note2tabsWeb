type HeavyPreviewIntroDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function HeavyPreviewIntroDialog({
  open,
  onCancel,
  onConfirm,
}: HeavyPreviewIntroDialogProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="heavy-preview-title"
      onMouseDown={onCancel}
    >
      <div
        className="heavy-preview-confirmation"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="heavy-preview-confirmation__close"
          onClick={onCancel}
          aria-label="Close"
        >
          ×
        </button>
        <h2 id="heavy-preview-title">Use your free Heavy model preview?</h2>
        <p className="heavy-preview-confirmation__body">
          This will use your account’s only free Heavy model transcription on 30 seconds of this recording.
          The Heavy model is normally available only with Premium or Pro.
        </p>
        <div className="heavy-preview-confirmation__actions">
          <button type="button" className="heavy-preview-confirmation__later" onClick={onCancel}>Not yet</button>
          <button type="button" className="button-primary" onClick={onConfirm}>Use my preview</button>
        </div>
      </div>
    </div>
  );
}
