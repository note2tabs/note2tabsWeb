import { useEffect, useState } from "react";

type AdvertisementSlotProps = {
  placement: "transcription-loading" | "editor";
  className?: string;
};

const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

const dismissalKey = (placement: AdvertisementSlotProps["placement"]) =>
  `note2tabs:ad-dismissed:${placement}`;

/**
 * Review surface for future ad inventory. The ad network must replace the
 * preview body only after its certified consent signal is available.
 */
export default function AdvertisementSlot({ placement, className = "" }: AdvertisementSlotProps) {
  const [visible, setVisible] = useState(false);
  const label = placement === "transcription-loading" ? "Transcription loading ad" : "Editor ad";

  useEffect(() => {
    const dismissedAt = Number(window.localStorage.getItem(dismissalKey(placement)) || 0);
    setVisible(!Number.isFinite(dismissedAt) || Date.now() - dismissedAt >= DISMISS_DURATION_MS);
  }, [placement]);

  const dismiss = () => {
    window.localStorage.setItem(dismissalKey(placement), String(Date.now()));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      className={`ad-slot ad-slot--${placement} ${className}`.trim()}
      aria-label={label}
      data-ad-placement={placement}
    >
      <button type="button" className="ad-slot__dismiss" onClick={dismiss} aria-label="Hide advertisement for 24 hours">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 4 8 8M12 4l-8 8" />
        </svg>
      </button>
      <span className="ad-slot__label">Advertisement</span>
      <span className="ad-slot__preview">Ad placement preview</span>
    </aside>
  );
}
