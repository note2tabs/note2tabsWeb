import { afterEach, describe, expect, it, vi } from "vitest";
import { installStaleChunkRecovery, isStaleChunkError } from "../../lib/staleChunkRecovery";

function routerEvents() {
  const handlers = new Map<string, (error: unknown) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (error: unknown) => void) => handlers.set(event, handler)),
    off: vi.fn((event: string) => handlers.delete(event)),
  };
}

describe("stale chunk recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("recognizes common framework chunk failures", () => {
    expect(isStaleChunkError(new Error("ChunkLoadError: Loading chunk 42 failed"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module"))).toBe(true);
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("reloads once and reports a repeated failure within the guard window", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      setTimeout,
      clearTimeout,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const events = routerEvents();
    const reload = vi.fn();
    const reportFailure = vi.fn();

    installStaleChunkRecovery(events, { now: () => 10_000, reload, reportFailure });
    events.handlers.get("routeChangeError")?.(new Error("ChunkLoadError: Loading chunk a failed"));
    expect(reload).toHaveBeenCalledOnce();

    const nextEvents = routerEvents();
    installStaleChunkRecovery(nextEvents, { now: () => 11_000, reload, reportFailure });
    nextEvents.handlers.get("routeChangeError")?.(new Error("ChunkLoadError: Loading chunk a failed"));
    expect(reload).toHaveBeenCalledOnce();
    expect(reportFailure).toHaveBeenCalledOnce();

    nextEvents.handlers.get("routeChangeError")?.(new Error("ChunkLoadError: Loading chunk b failed"));
    expect(reportFailure).toHaveBeenCalledOnce();
  });

  it("allows a new recovery after the reloaded app remains stable", () => {
    vi.useFakeTimers();
    const storage = new Map<string, string>([["note2tabs:stale-chunk-recovery", "10000"]]);
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      setTimeout,
      clearTimeout,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const events = routerEvents();
    const reload = vi.fn();

    installStaleChunkRecovery(events, { now: () => 30_000, reload });
    vi.advanceTimersByTime(10_000);

    events.handlers.get("routeChangeError")?.(new Error("ChunkLoadError: Loading chunk c failed"));
    expect(reload).toHaveBeenCalledOnce();
  });
});
