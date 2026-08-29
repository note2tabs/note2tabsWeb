import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendEvent } from "../analytics";
import { hasAdvertisingConsent } from "../consentPreferences";
import { getAdRuntimeConfig, isAdRuntimeConfigured, readAdRegion } from "./config";
import { isAdInteractionEligible } from "./eligibility";
import { getAdProvider } from "./provider";
import type { AdProviderEvent, AdProviderHandle, AdPlacement } from "./types";

type RuntimeStatus =
  | "preview"
  | "disabled"
  | "blocked"
  | "waiting"
  | "loading"
  | "filled"
  | "empty"
  | "error";

type UseAdSlotRuntimeInput = {
  placement: AdPlacement;
  preview: boolean;
  suppressed: boolean;
  simulation?: boolean;
  context?: Record<string, string | number | boolean | null | undefined>;
};

const randomSlotId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `ad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
};

export function useAdSlotRuntime({
  placement,
  preview,
  suppressed,
  simulation = false,
  context = {},
}: UseAdSlotRuntimeInput) {
  const config = useMemo(() => {
    const resolved = getAdRuntimeConfig(placement);
    if (!simulation) return resolved;
    return {
      ...resolved,
      enabled: true,
      provider: "mock",
      unitId: `dev/${placement}`,
      refreshEnabled: false,
      blockedRegions: [],
      allowLimitedAdsWithoutConsent: true,
    };
  }, [placement, simulation]);
  const liveConfigured = isAdRuntimeConfigured(config);
  const contextRef = useRef(context);
  contextRef.current = context;
  const slotIdRef = useRef(randomSlotId());
  const elementRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<AdProviderHandle | null>(null);
  const mountedRef = useRef(false);
  const visibleRatioRef = useRef(0);
  const pageVisibleRef = useRef(true);
  const lastActivityAtRef = useRef(Date.now());
  const refreshCountRef = useRef(0);
  const lastFillAtRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const viewableTimerRef = useRef<number | null>(null);
  const viewableForFillRef = useRef(false);
  const [consentRevision, setConsentRevision] = useState(0);
  const [status, setStatus] = useState<RuntimeStatus>(preview ? "preview" : "disabled");
  const terminal = status === "empty" || status === "error";

  const track = useCallback(
    (event: string, properties: Record<string, unknown> = {}) => {
      if (simulation) return;
      sendEvent(event, {
        placement,
        provider: config.provider,
        slot_session_id: slotIdRef.current,
        refresh_count: refreshCountRef.current,
        ...contextRef.current,
        ...properties,
      });
    },
    [config.provider, placement, simulation]
  );

  const clearTimers = useCallback(() => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    if (viewableTimerRef.current !== null) window.clearTimeout(viewableTimerRef.current);
    refreshTimerRef.current = null;
    viewableTimerRef.current = null;
  }, []);

  const isEngagedAndVisible = useCallback(
    () =>
      isAdInteractionEligible({
        documentVisible: document.visibilityState === "visible",
        visibleRatio: visibleRatioRef.current,
        minVisibleRatio: config.minVisibleRatio,
        lastActivityAt: lastActivityAtRef.current,
        idleAfterMs: config.idleAfterMs,
        now: Date.now(),
      }),
    [config.idleAfterMs, config.minVisibleRatio]
  );

  const scheduleRefresh = useCallback(() => {
    if (
      !config.refreshEnabled ||
      refreshCountRef.current >= config.maxRefreshes ||
      !handleRef.current?.refresh
    ) return;
    if (refreshTimerRef.current !== null) return;
    // A refresh interval begins only while the slot is currently viewable and
    // the page is active. Returning from the background or scrolling the slot
    // back into view starts a fresh interval rather than creating an immediate
    // impression after mostly invisible elapsed time.
    if (!isEngagedAndVisible()) return;
    const remaining = config.refreshSeconds * 1000;
    refreshTimerRef.current = window.setTimeout(async () => {
      refreshTimerRef.current = null;
      if (!isEngagedAndVisible() || !handleRef.current?.refresh) return;
      refreshCountRef.current += 1;
      track("ad_refresh_requested", { trigger: "engaged_viewable_interval" });
      try {
        await handleRef.current.refresh();
      } catch (error) {
        track("ad_error", {
          error_code: error instanceof Error ? error.message.slice(0, 80) : "refresh_failed",
          operation: "refresh",
        });
      }
    }, remaining);
  }, [config.maxRefreshes, config.refreshEnabled, config.refreshSeconds, isEngagedAndVisible, track]);

  const scheduleClientViewability = useCallback(() => {
    if (viewableForFillRef.current || viewableTimerRef.current !== null) return;
    viewableTimerRef.current = window.setTimeout(() => {
      viewableTimerRef.current = null;
      if (isEngagedAndVisible()) {
        viewableForFillRef.current = true;
        track("ad_client_viewable_observation", { duration_ms: 1000 });
      }
    }, 1000);
  }, [isEngagedAndVisible, track]);

  const onProviderEvent = useCallback(
    (event: AdProviderEvent) => {
      const common = "demandSource" in event ? { demand_source: event.demandSource } : {};
      if (event.type === "fill") {
        setStatus("filled");
        viewableForFillRef.current = false;
        lastFillAtRef.current = Date.now();
        track("ad_fill", common);
        scheduleClientViewability();
        scheduleRefresh();
      }
      if (event.type === "no-fill") {
        setStatus("empty");
        track("ad_no_fill", common);
      }
      if (event.type === "impression") track("ad_impression", common);
      if (event.type === "viewable") track("ad_viewable_impression", { ...common, measurement_source: "provider" });
      if (event.type === "revenue") {
        track("ad_revenue", {
          ...common,
          revenue_micros: Math.max(0, Math.round(event.revenueMicros)),
          currency: event.currency.slice(0, 3).toUpperCase(),
        });
      }
      if (event.type === "error") {
        setStatus("error");
        track("ad_error", { error_code: event.code || "provider_error" });
      }
    },
    [scheduleClientViewability, scheduleRefresh, track]
  );

  useEffect(() => {
    if (preview || simulation || !liveConfigured || suppressed) return;
    const onConsent = () => {
      setStatus("waiting");
      setConsentRevision((value) => value + 1);
    };
    window.addEventListener("note2tabs:consent-changed", onConsent);
    return () => window.removeEventListener("note2tabs:consent-changed", onConsent);
  }, [liveConfigured, preview, simulation, suppressed]);

  useEffect(() => {
    if (preview && !simulation) {
      setStatus("preview");
      return;
    }
    if (!liveConfigured) {
      setStatus("disabled");
      return;
    }
    if (terminal) return;
    const region = readAdRegion();
    if (!simulation && region && config.blockedRegions.includes(region)) {
      setStatus("blocked");
      track("ad_slot_blocked", { reason: "region", region });
      return;
    }
    if (!simulation && !hasAdvertisingConsent() && !config.allowLimitedAdsWithoutConsent) {
      setStatus("blocked");
      return;
    }
    if (suppressed) return;

    const element = elementRef.current;
    if (!element) return;
    let active = true;
    pageVisibleRef.current = document.visibilityState === "visible";
    const mountIfEligible = () => {
      if (mountedRef.current || !isEngagedAndVisible()) return;
      const provider = getAdProvider(config.provider);
      mountedRef.current = true;
      setStatus("loading");
      track("ad_slot_eligible", {
        limited_ads: !simulation && !hasAdvertisingConsent(),
        demand_sources: config.demandSources.join(","),
      });
      track("ad_request");
      void Promise.resolve(provider.load())
        .then(() =>
          provider.mount(
            element,
            {
              slotId: slotIdRef.current,
              placement,
              unitId: config.unitId,
              sizes: config.sizes,
              demandSources: config.demandSources,
              limitedAds: !simulation && !hasAdvertisingConsent(),
            },
            (event) => {
              if (active) onProviderEvent(event);
            }
          )
        )
        .then((handle) => {
          if (!active) {
            void handle.destroy();
            return;
          }
          handleRef.current = handle;
          if (lastFillAtRef.current) scheduleRefresh();
        })
        .catch((error) => {
          if (!active) return;
          setStatus("error");
          track("ad_error", {
            error_code: error instanceof Error ? error.message.slice(0, 80) : "provider_load_failed",
          });
        });
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRatioRef.current = entry?.intersectionRatio || 0;
        mountIfEligible();
        if (
          visibleRatioRef.current >= config.minVisibleRatio &&
          handleRef.current &&
          !viewableForFillRef.current
        ) {
          scheduleClientViewability();
          if (lastFillAtRef.current) scheduleRefresh();
        } else if (viewableTimerRef.current !== null) {
          window.clearTimeout(viewableTimerRef.current);
          viewableTimerRef.current = null;
          if (refreshTimerRef.current !== null) {
            window.clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
          }
        }
      },
      { threshold: [0, config.minVisibleRatio, 1] }
    );
    observer.observe(element);

    const onActivity = () => {
      lastActivityAtRef.current = Date.now();
      mountIfEligible();
      if (lastFillAtRef.current) scheduleRefresh();
    };
    const onVisibility = () => {
      pageVisibleRef.current = document.visibilityState === "visible";
      mountIfEligible();
      if (pageVisibleRef.current) {
        if (handleRef.current && !viewableForFillRef.current) scheduleClientViewability();
        if (lastFillAtRef.current) scheduleRefresh();
      } else {
        if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
        if (viewableTimerRef.current !== null) window.clearTimeout(viewableTimerRef.current);
        refreshTimerRef.current = null;
        viewableTimerRef.current = null;
      }
    };
    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    setStatus("waiting");

    return () => {
      active = false;
      observer.disconnect();
      activityEvents.forEach((name) => window.removeEventListener(name, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimers();
      const handle = handleRef.current;
      handleRef.current = null;
      mountedRef.current = false;
      if (handle) void handle.destroy();
    };
  }, [
    clearTimers,
    config.allowLimitedAdsWithoutConsent,
    config.blockedRegions,
    config.demandSources,
    config.minVisibleRatio,
    config.provider,
    config.sizes,
    config.unitId,
    consentRevision,
    isEngagedAndVisible,
    liveConfigured,
    onProviderEvent,
    placement,
    preview,
    scheduleRefresh,
    scheduleClientViewability,
    simulation,
    suppressed,
    terminal,
    track,
  ]);

  return { elementRef, liveConfigured, status };
}
