import { useEffect, useRef } from "react";

type MeasureEntry = {
  name: string;
  durationMs: number;
  detail?: Record<string, unknown>;
  at: number;
};

type RenderCounts = Record<string, number>;

declare global {
  interface Window {
    __NOTE2TABS_GTE_PERF__?: {
      renders: RenderCounts;
      measures: MeasureEntry[];
      playbackFrameUpdates: number;
      reset: () => void;
    };
  }
}

export const isGtePerfDiagnosticsEnabled = () => {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem("note2tabs:gte-perf") === "1" ||
      new URLSearchParams(window.location.search).has("gtePerf")
    );
  } catch {
    return false;
  }
};

const getPerfStore = () => {
  if (typeof window === "undefined" || !isGtePerfDiagnosticsEnabled()) return null;
  if (!window.__NOTE2TABS_GTE_PERF__) {
    window.__NOTE2TABS_GTE_PERF__ = {
      renders: {},
      measures: [],
      playbackFrameUpdates: 0,
      reset() {
        this.renders = {};
        this.measures = [];
        this.playbackFrameUpdates = 0;
      },
    };
  }
  return window.__NOTE2TABS_GTE_PERF__;
};

export const recordGtePerfMeasure = (
  name: string,
  durationMs: number,
  detail?: Record<string, unknown>
) => {
  const store = getPerfStore();
  if (!store) return;
  store.measures.push({
    name,
    durationMs,
    detail,
    at: performance.now(),
  });
};

export const incrementGtePlaybackFrameUpdates = () => {
  const store = getPerfStore();
  if (!store) return;
  store.playbackFrameUpdates += 1;
};

export function useGteRenderInstrumentation(name: string, detail?: string) {
  const labelRef = useRef(detail ? `${name}:${detail}` : name);
  useEffect(() => {
    const store = getPerfStore();
    if (!store) return;
    store.renders[labelRef.current] = (store.renders[labelRef.current] || 0) + 1;
  });
}
