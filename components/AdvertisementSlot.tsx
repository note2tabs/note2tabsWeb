type AdvertisementSlotProps = {
  placement: "transcription-loading" | "editor";
  className?: string;
};

/**
 * Review surface for future ad inventory. The ad network must replace the
 * preview body only after its certified consent signal is available.
 */
export default function AdvertisementSlot({ placement, className = "" }: AdvertisementSlotProps) {
  const label = placement === "transcription-loading" ? "Transcription loading ad" : "Editor ad";

  return (
    <aside
      className={`ad-slot ad-slot--${placement} ${className}`.trim()}
      aria-label={label}
      data-ad-placement={placement}
    >
      <span className="ad-slot__label">Advertisement</span>
      <span className="ad-slot__preview">Ad placement preview</span>
    </aside>
  );
}
