import { useLocale } from "../lib/i18n/react";
import { useRef, type KeyboardEvent } from "react";
import {
  TRANSCRIPTION_MODEL_OPTIONS,
  type TranscriptionModelChoice,
} from "../lib/transcriptionModels";

type TranscriptionModelDropdownProps = {
  value: TranscriptionModelChoice;
  onChange: (value: TranscriptionModelChoice) => void;
  disabled?: boolean;
  id?: string;
  canUseHeavy?: boolean;
  heavyPreviewAvailable?: boolean;
  verificationRequired?: boolean;
  onLockedHeavySelect?: () => void;
};

export default function TranscriptionModelDropdown({
  value,
  onChange,
  disabled = false,
  id = "transcription-model",
  canUseHeavy = false,
  heavyPreviewAvailable = false,
  verificationRequired = false,
  onLockedHeavySelect,
}: TranscriptionModelDropdownProps) {
  const { t } = useLocale();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const selected =
    TRANSCRIPTION_MODEL_OPTIONS.find((option) => option.value === value) ??
    TRANSCRIPTION_MODEL_OPTIONS[0];
  const selectedBadge =
    selected.value === "super_heavy"
      ? verificationRequired
        ? t("Verify to unlock")
        : heavyPreviewAvailable
          ? t("One 30 s preview")
          : selected.badge
      : selected.badge;

  const choose = (nextValue: TranscriptionModelChoice) => {
    onChange(nextValue);
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  };

  const onOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    nextValue: TranscriptionModelChoice
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(nextValue);
    }
  };

  return (
    <details
      ref={detailsRef}
      className="model-dropdown"
      data-disabled={disabled ? "true" : undefined}
    >
      <summary
        id={id}
        aria-label={t("Transcription model: {model}, {badge}", { model: t(selected.label), badge: t(selectedBadge) })}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        <span className="model-dropdown-summary-copy">
          <span>{t(selected.label)}</span>
          <span>{t(selectedBadge)}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
          <path d="M5.5 7.5 10 12l4.5-4.5" />
        </svg>
      </summary>
      <div className="model-dropdown-menu" role="listbox" aria-labelledby={id}>
        {TRANSCRIPTION_MODEL_OPTIONS.map((option) => {
          const isHeavy = option.value === "super_heavy";
          const isLocked = isHeavy && !canUseHeavy;
          const heavyBadge = verificationRequired
            ? t("Verify to unlock")
            : heavyPreviewAvailable
              ? t("One 30 s preview")
              : t("Premium or Pro");
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`${option.value === value ? "selected" : ""}${isLocked ? " model-dropdown-option--locked" : ""}`}
              onClick={() => {
                if (isLocked) {
                  onLockedHeavySelect?.();
                  if (detailsRef.current) detailsRef.current.open = false;
                  return;
                }
                choose(option.value);
              }}
              onKeyDown={(event) => {
                if (isLocked && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onLockedHeavySelect?.();
                  if (detailsRef.current) detailsRef.current.open = false;
                  return;
                }
                onOptionKeyDown(event, option.value);
              }}
              aria-disabled={isLocked}
              title={
                isLocked
                  ? verificationRequired
                    ? t("Verify your email to unlock one free Heavy preview")
                    : t("Heavy requires Premium or Pro")
                  : undefined
              }
            >
              <span className="model-dropdown-option-copy">
                <span className="model-dropdown-option-heading">
                  <span className="model-dropdown-option-title">{t(option.label)}</span>
                  <span className="model-dropdown-option-badge">
                    {t(isHeavy ? heavyBadge : option.badge)}
                  </span>
                </span>
                <span className="model-dropdown-option-description">
                  {t(option.description)}
                </span>
              </span>
              <span className="model-dropdown-check" aria-hidden="true">
                {option.value === value && (
                  <svg viewBox="0 0 24 18" focusable="false">
                    <path d="M4.4 10.8 9.6 13.8 19.8 3.4" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
