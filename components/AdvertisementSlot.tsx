import { useEffect, useRef, useState } from "react";
import { sendEvent } from "../lib/analytics";
import {
  AD_EXPERIENCE_FLAG,
  normalizeAdExperienceVariant,
  type AdExperienceVariant,
} from "../lib/adExperienceExperiment";
import { initPostHog } from "../lib/posthogClient";

type AdvertisementSlotProps = {
  placement: "transcription-loading" | "editor";
  className?: string;
  preview?: boolean;
};

const DISMISS_DURATION_MS = 10 * 60 * 1000;

const dismissalKey = (placement: AdvertisementSlotProps["placement"]) =>
  `note2tabs:ad-dismissed:${placement}`;

/**
 * Review surface for future ad inventory. The ad network must replace the
 * preview body only after its certified consent signal is available.
 */
export default function AdvertisementSlot({ placement, className = "", preview = false }: AdvertisementSlotProps) {
  const [visible, setVisible] = useState(preview);
  const [variant, setVariant] = useState<AdExperienceVariant | null>(
    preview ? "discreet-dismissible" : null
  );
  const exposureTrackedRef = useRef(false);
  const impressionTrackedRef = useRef(false);
  const label = placement === "transcription-loading" ? "Transcription loading ad" : "Editor ad";

  useEffect(() => {
    if (preview) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let fallbackTimer: number | undefined;

    const applyVariant = (nextVariant: AdExperienceVariant) => {
      if (!active) return;
      setVariant(nextVariant);
      if (!exposureTrackedRef.current) {
        exposureTrackedRef.current = true;
        sendEvent("ad_experiment_exposure", {
          experiment: AD_EXPERIENCE_FLAG,
          variant: nextVariant,
          placement,
        });
      }
    };

    void initPostHog().then((posthog) => {
      if (!active) return;
      if (!posthog) {
        applyVariant("discreet-dismissible");
        return;
      }
      const resolve = () => {
        const flagValue = posthog.getFeatureFlag(AD_EXPERIENCE_FLAG);
        if (flagValue === undefined) return;
        if (fallbackTimer) window.clearTimeout(fallbackTimer);
        applyVariant(normalizeAdExperienceVariant(flagValue));
      };
      resolve();
      unsubscribe = posthog.onFeatureFlags(resolve);
      fallbackTimer = window.setTimeout(() => applyVariant("discreet-dismissible"), 2500);
    });

    return () => {
      active = false;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      unsubscribe?.();
    };
  }, [placement, preview]);

  useEffect(() => {
    if (preview) return;
    if (!variant) return;
    if (variant === "control") {
      setVisible(false);
      return;
    }
    const dismissedAt = Number(window.localStorage.getItem(dismissalKey(placement)) || 0);
    const shouldShow = !Number.isFinite(dismissedAt) || Date.now() - dismissedAt >= DISMISS_DURATION_MS;
    setVisible(shouldShow);
    if (shouldShow && !impressionTrackedRef.current) {
      impressionTrackedRef.current = true;
      sendEvent("ad_impression", { experiment: AD_EXPERIENCE_FLAG, variant, placement });
    }
  }, [placement, preview, variant]);

  const dismiss = () => {
    if (!preview) window.localStorage.setItem(dismissalKey(placement), String(Date.now()));
    setVisible(false);
    if (preview) return;
    sendEvent("ad_dismissed", {
      experiment: AD_EXPERIENCE_FLAG,
      variant: variant || "discreet-dismissible",
      placement,
      dismiss_duration_minutes: DISMISS_DURATION_MS / (60 * 1000),
    });
  };

  if (!visible) return null;

  return (
    <aside
      className={`ad-slot ad-slot--${placement} ${className}`.trim()}
      aria-label={label}
      data-ad-placement={placement}
    >
      <button type="button" className="ad-slot__dismiss" onClick={dismiss} aria-label="Hide advertisement for 10 minutes">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 4 8 8M12 4l-8 8" />
        </svg>
      </button>
      <span className="ad-slot__label">Advertisement</span>
      <span className="ad-slot__preview">Ad placement preview</span>
    </aside>
  );
}
