import { useLocale } from "../lib/i18n/react";

type HeavyPreviewOfferProps = {
  selected: boolean;
  onSelect: () => void;
};

export default function HeavyPreviewOffer({ selected, onSelect }: HeavyPreviewOfferProps) {
  const { t } = useLocale();
  return (
    <aside className="heavy-preview-offer" aria-label={t("Free Heavy model preview")}>
      <div className="heavy-preview-offer__copy">
        <div className="heavy-preview-offer__title">
          <strong>{t("Try our Heavy model")}</strong>
        </div>
        <p>{t("Use our most accurate model on 30 seconds of this recording.")}</p>
      </div>
      <button
        type="button"
        className={`heavy-preview-offer__action${selected ? " is-selected" : ""}`}
        onClick={onSelect}
        aria-pressed={selected}
      >
        {selected ? t("Selected") : t("Try Heavy")}
      </button>
    </aside>
  );
}
