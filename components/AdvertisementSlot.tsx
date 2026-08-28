import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import {
  AD_EXPERIENCE_FLAG,
  normalizeAdExperienceVariant,
  type AdExperienceVariant,
} from "../lib/adExperienceExperiment";
import { initPostHog } from "../lib/posthogClient";
import {
  getOrCreatePremiumFunnelContext,
  premiumFunnelProperties,
  premiumPricingHref,
  type PremiumFunnelContext,
} from "../lib/premiumFunnel";

type AdvertisementSlotProps = {
  placement: "transcription-loading" | "editor" | "editor-practice";
  className?: string;
  preview?: boolean;
};

const DISMISS_DURATION_MS = 10 * 60 * 1000;
const AD_FREE_PROMPT_DURATION_MS = 8 * 1000;
const AD_FREE_PROMPT_FREQUENCY_MS = 7 * 24 * 60 * 60 * 1000;
const AD_FREE_PROMPT_SHOWN_AT_KEY = "note2tabs:ad-free-prompt-shown-at";

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
  const [adFreePromptVisible, setAdFreePromptVisible] = useState(false);
  const [premiumFunnel, setPremiumFunnel] = useState<PremiumFunnelContext | null>(null);
  const exposureTrackedRef = useRef(false);
  const impressionTrackedRef = useRef(false);
  const adFreePromptTimerRef = useRef<number | null>(null);
  const label =
    placement === "transcription-loading"
      ? "Transcription loading ad"
      : placement === "editor-practice"
      ? "Practice mode ad"
      : "Editor ad";

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

  useEffect(
    () => () => {
      if (adFreePromptTimerRef.current !== null) {
        window.clearTimeout(adFreePromptTimerRef.current);
      }
    },
    []
  );

  const dismiss = () => {
    const now = Date.now();
    let shouldShowAdFreePrompt = preview;
    if (!preview) {
      try {
        window.localStorage.setItem(dismissalKey(placement), String(now));
        const lastShownAt = Number(window.localStorage.getItem(AD_FREE_PROMPT_SHOWN_AT_KEY) || 0);
        shouldShowAdFreePrompt =
          !Number.isFinite(lastShownAt) || now - lastShownAt >= AD_FREE_PROMPT_FREQUENCY_MS;
        if (shouldShowAdFreePrompt) {
          window.localStorage.setItem(AD_FREE_PROMPT_SHOWN_AT_KEY, String(now));
        }
      } catch {
        shouldShowAdFreePrompt = true;
      }
    }
    setVisible(false);
    if (!preview) {
      sendEvent("ad_dismissed", {
        experiment: AD_EXPERIENCE_FLAG,
        variant: variant || "discreet-dismissible",
        placement,
        dismiss_duration_minutes: DISMISS_DURATION_MS / (60 * 1000),
      });
    }
    if (!shouldShowAdFreePrompt) return;

    const funnel = getOrCreatePremiumFunnelContext({
      source: "premium_prompt",
      reason: "ad_free_after_dismissal",
    });
    setPremiumFunnel(funnel);
    setAdFreePromptVisible(true);
    if (!preview) {
      sendEvent(ANALYTICS_EVENTS.premiumPromptShown, {
        surface: "ad_dismissal_inline",
        placement,
        ...premiumFunnelProperties(funnel),
      });
    }
    if (adFreePromptTimerRef.current !== null) {
      window.clearTimeout(adFreePromptTimerRef.current);
    }
    adFreePromptTimerRef.current = window.setTimeout(() => {
      setAdFreePromptVisible(false);
      adFreePromptTimerRef.current = null;
    }, AD_FREE_PROMPT_DURATION_MS);
  };

  if (adFreePromptVisible && premiumFunnel) {
    return (
      <aside
        className={`ad-slot ad-slot--${placement} ad-slot--premium-replacement ${className}`.trim()}
        aria-label="Ad-free Premium option"
        aria-live="polite"
      >
        <span className="ad-slot__premium-message">Prefer an ad-free workspace?</span>
        <Link
          className="ad-slot__premium-link"
          href={premiumPricingHref(premiumFunnel)}
          onClick={() => {
            if (preview) return;
            sendEvent(ANALYTICS_EVENTS.premiumPromptClicked, {
              surface: "ad_dismissal_inline",
              placement,
              ...premiumFunnelProperties(premiumFunnel),
            });
            trackCtaClick("ad_dismissal_explore_premium", {
              surface: "ad_dismissal_inline",
              placement,
              ...premiumFunnelProperties(premiumFunnel),
            });
          }}
        >
          Explore Premium
        </Link>
      </aside>
    );
  }

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
