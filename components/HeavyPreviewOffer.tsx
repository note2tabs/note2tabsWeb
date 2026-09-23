import { useState } from "react";

type HeavyPreviewOfferProps = {
  selected: boolean;
  onSelect: () => void;
};

export default function HeavyPreviewOffer({ selected, onSelect }: HeavyPreviewOfferProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        className="heavy-preview-offer heavy-preview-offer--collapsed"
        onClick={() => setCollapsed(false)}
      >
        <span className="heavy-preview-offer__dot" aria-hidden="true" />
        Free Heavy preview available
        <span aria-hidden="true">→</span>
      </button>
    );
  }

  return (
    <aside className="heavy-preview-offer" aria-label="Free Heavy model preview">
      <button
        type="button"
        className="heavy-preview-offer__dismiss"
        onClick={() => setCollapsed(true)}
        aria-label="Collapse Heavy preview offer"
      >
        ×
      </button>
      <div className="heavy-preview-offer__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 10v4" />
        </svg>
      </div>
      <div className="heavy-preview-offer__copy">
        <span className="heavy-preview-offer__eyebrow">Included with your verified account</span>
        <strong>Try our most accurate model free</strong>
        <p>Use Heavy once on any 30-second section. No credits needed.</p>
      </div>
      <button
        type="button"
        className={`heavy-preview-offer__action${selected ? " is-selected" : ""}`}
        onClick={onSelect}
        aria-pressed={selected}
      >
        {selected ? (
          <>
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="m4.5 10.2 3.4 3.3 7.6-7.2" />
            </svg>
            Heavy selected
          </>
        ) : (
          "Use free preview"
        )}
      </button>
    </aside>
  );
}
