import type { AdPlacement } from "./types";

const MIN_REFRESH_SECONDS = 60;

const PLACEMENT_SIZES: Record<AdPlacement, ReadonlyArray<readonly [number, number]>> = {
  "transcription-loading": [[728, 90], [320, 50]],
  editor: [[728, 90], [320, 50]],
  "editor-practice": [[728, 90], [320, 50]],
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const parseList = (value: string | undefined) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const unitIdForPlacement = (placement: AdPlacement) => {
  if (placement === "transcription-loading") return process.env.NEXT_PUBLIC_AD_UNIT_TRANSCRIPTION_LOADING || "";
  if (placement === "editor-practice") return process.env.NEXT_PUBLIC_AD_UNIT_EDITOR_PRACTICE || "";
  return process.env.NEXT_PUBLIC_AD_UNIT_EDITOR || "";
};

export type AdRuntimeConfig = ReturnType<typeof getAdRuntimeConfig>;

export function getAdRuntimeConfig(placement: AdPlacement) {
  const disabledPlacements = parseList(process.env.NEXT_PUBLIC_ADS_DISABLED_PLACEMENTS);
  const refreshSeconds = parseNumber(
    process.env.NEXT_PUBLIC_AD_REFRESH_SECONDS,
    MIN_REFRESH_SECONDS,
    MIN_REFRESH_SECONDS,
    30 * 60
  );
  return {
    enabled:
      parseBoolean(process.env.NEXT_PUBLIC_ADS_ENABLED, false) &&
      !disabledPlacements.includes(placement),
    provider: (process.env.NEXT_PUBLIC_AD_PROVIDER || "none").trim().toLowerCase(),
    unitId: unitIdForPlacement(placement),
    sizes: PLACEMENT_SIZES[placement],
    demandSources: parseList(process.env.NEXT_PUBLIC_AD_DEMAND_SOURCES),
    refreshEnabled: parseBoolean(process.env.NEXT_PUBLIC_AD_REFRESH_ENABLED, false),
    refreshSeconds,
    maxRefreshes: Math.round(parseNumber(process.env.NEXT_PUBLIC_AD_MAX_REFRESHES, 8, 0, 50)),
    minVisibleRatio: parseNumber(process.env.NEXT_PUBLIC_AD_MIN_VISIBLE_RATIO, 0.5, 0.5, 1),
    idleAfterMs:
      parseNumber(process.env.NEXT_PUBLIC_AD_IDLE_AFTER_SECONDS, 60, 15, 30 * 60) * 1000,
    blockedRegions: parseList(process.env.NEXT_PUBLIC_ADS_BLOCKED_REGIONS).map((item) => item.toUpperCase()),
    allowLimitedAdsWithoutConsent: parseBoolean(
      process.env.NEXT_PUBLIC_ADS_ALLOW_LIMITED_WITHOUT_CONSENT,
      false
    ),
  };
}

export function readAdRegion() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )note2tabs_region=([^;]*)/);
  return match ? decodeURIComponent(match[1]).trim().toUpperCase() : "";
}

export function isAdRuntimeConfigured(config: AdRuntimeConfig) {
  return config.enabled && config.provider !== "none" && Boolean(config.unitId);
}
