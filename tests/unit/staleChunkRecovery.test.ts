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

  it("does not reset the five-minute guard after ten seconds of boot time", () => {
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
    const reportFailure = vi.fn();

    installStaleChunkRecovery(events, { now: () => 30_000, reload, reportFailure });
    vi.advanceTimersByTime(10_000);

    events.handlers.get("routeChangeError")?.(new Error("ChunkLoadError: Loading chunk c failed"));
    expect(reload).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledOnce();
  });

  it("allows an independent recovery after the five-minute window expires", () => {
    const storage = new Map([["note2tabs:stale-chunk-recovery", "10000"]]);
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    const events = routerEvents();
    const reload = vi.fn();
    const reportFailure = vi.fn();
    installStaleChunkRecovery(events, { now: () => 310_000, reload, reportFailure });
    events.handlers.get("routeChangeError")?.(new Error("ChunkLoadError: Loading chunk c failed"));
    expect(reload).toHaveBeenCalledOnce();
    expect(reportFailure).not.toHaveBeenCalled();
    expect(storage.get("note2tabs:stale-chunk-recovery")).toBe("310000");
  });

  it.each(["read", "write"])("does not start an unguarded reload when storage %s fails", operation => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => { if (operation === "read") throw new Error("Storage blocked"); return null; },
        setItem: () => { throw new Error("Storage blocked"); },
      },
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    const events = routerEvents();
    const reload = vi.fn();
    const reportFailure = vi.fn();
    installStaleChunkRecovery(events, {now: () => 10_000, reload, reportFailure});
    events.handlers.get("routeChangeError")?.(new Error("ChunkLoadError: Loading chunk a failed"));
    events.handlers.get("routeChangeError")?.(new Error("ChunkLoadError: Loading chunk b failed"));
    expect(reload).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledOnce();
  });

  it("unsubscribes router and browser listeners when unmounted", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener });
    const events = routerEvents();
    const cleanup = installStaleChunkRecovery(events);
    cleanup();
    expect(events.off).toHaveBeenCalledWith("routeChangeError", events.on.mock.calls[0][1]);
    expect(removeEventListener.mock.calls).toEqual(addEventListener.mock.calls);
  });
});
