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
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-left shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
          One-time preview
        </p>
        <h2 id="heavy-preview-title" className="m-0 text-2xl font-semibold tracking-tight text-slate-950">
          Try Heavy for 30 seconds
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your verified account includes this preview once, at no credit cost. Afterward, Heavy is available with Premium or Pro.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="button-secondary" onClick={onCancel}>Not now</button>
          <button type="button" className="button-primary" onClick={onConfirm}>Use my preview</button>
        </div>
      </div>
    </div>
  );
}
