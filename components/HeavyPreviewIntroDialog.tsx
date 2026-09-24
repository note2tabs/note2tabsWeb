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
        <h2 id="heavy-preview-title">Use your Heavy preview?</h2>
        <p className="heavy-preview-confirmation__body">
          Heavy is our most accurate model. Starting this transcription will use your one free preview.
        </p>
        <p className="heavy-preview-confirmation__summary">30 seconds · No credits · Available once</p>
        <div className="heavy-preview-confirmation__actions">
          <button type="button" className="button-secondary" onClick={onCancel}>Not now</button>
          <button type="button" className="button-primary" onClick={onConfirm}>Use Heavy preview</button>
        </div>
      </div>
    </div>
  );
}
