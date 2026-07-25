type EditorLoadingStateProps = {
  label?: string;
};

export function EditorLoadingState({
  label = "Preparing your editor",
}: EditorLoadingStateProps) {
  return (
    <div className="gte-editor-loading" role="status" aria-live="polite" aria-label={label}>
      <div className="gte-editor-loading__screen" aria-hidden="true">
        <div className="gte-editor-loading__toolbar">
          <span className="gte-loading-block gte-loading-block--title" />
          <span className="gte-loading-block gte-loading-block--control" />
          <span className="gte-loading-block gte-loading-block--control" />
          <span className="gte-loading-block gte-loading-block--short" />
        </div>
        <div className="gte-editor-loading__track-head">
          <span className="gte-loading-block gte-loading-block--track-title" />
          <span className="gte-loading-block gte-loading-block--short" />
        </div>
        <div className="gte-editor-loading__timeline">
          <span className="gte-editor-loading__rail" />
          <span className="gte-editor-loading__rail gte-editor-loading__rail--short" />
          <span className="gte-editor-loading__rail" />
          <span className="gte-editor-loading__rail gte-editor-loading__rail--medium" />
        </div>
      </div>
      <p className="gte-editor-loading__label">{label}…</p>
    </div>
  );
}

export function EditorLibraryLoadingState() {
  return (
    <div
      className="gte-library-loading"
      role="status"
      aria-live="polite"
      aria-label="Loading editors"
    >
      {[0, 1, 2].map((item) => (
        <div className="card-outline gte-library-row gte-library-row--loading" key={item}>
          <span className="gte-loading-block gte-loading-block--library-title" />
          <span className="gte-loading-block gte-loading-block--library-meta" />
          <span className="gte-loading-block gte-loading-block--menu" />
        </div>
      ))}
    </div>
  );
}
