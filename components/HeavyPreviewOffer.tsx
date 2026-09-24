type HeavyPreviewOfferProps = {
  selected: boolean;
  onSelect: () => void;
};

export default function HeavyPreviewOffer({ selected, onSelect }: HeavyPreviewOfferProps) {
  return (
    <aside className="heavy-preview-offer" aria-label="Free Heavy model preview">
      <div className="heavy-preview-offer__copy">
        <div className="heavy-preview-offer__title">
          <strong>Try our Heavy model</strong>
        </div>
        <p>Use our most accurate model on 30 seconds of this recording.</p>
      </div>
      <button
        type="button"
        className={`heavy-preview-offer__action${selected ? " is-selected" : ""}`}
        onClick={onSelect}
        aria-pressed={selected}
      >
        {selected ? "Selected" : "Try Heavy"}
      </button>
    </aside>
  );
}
