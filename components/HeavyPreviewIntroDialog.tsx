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
        <div className="heavy-preview-confirmation__mark" aria-hidden="true">
          <svg viewBox="0 0 28 28" focusable="false">
            <path d="M5 12v4M10 8v12M15 5v18M20 9v10M25 12v4" />
          </svg>
        </div>
        <p className="heavy-preview-confirmation__eyebrow">One-time Heavy preview</p>
        <h2 id="heavy-preview-title">Use your preview on this transcription?</h2>
        <p className="heavy-preview-confirmation__body">
          Heavy is our most accurate model. This transcription uses your account’s single free preview.
        </p>
        <dl className="heavy-preview-confirmation__facts">
          <div><dt>Length</dt><dd>Up to 30 seconds</dd></div>
          <div><dt>Cost</dt><dd>No credits</dd></div>
          <div><dt>After this</dt><dd>Premium or Pro</dd></div>
        </dl>
        <p className="heavy-preview-confirmation__note">Your preview is only counted after the transcription starts.</p>
        <div className="heavy-preview-confirmation__actions">
          <button type="button" className="button-secondary" onClick={onCancel}>Save for later</button>
          <button type="button" className="button-primary" onClick={onConfirm}>Use Heavy once</button>
        </div>
      </div>
    </div>
  );
}
