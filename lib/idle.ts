type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCallback = (deadline: IdleDeadlineLike) => void;

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: IdleCallback, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleIdle(callback: () => void, timeout = 1500) {
  if (typeof window === "undefined") return () => {};

  const idleWindow = window as WindowWithIdleCallback;
  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(() => callback(), { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, Math.min(timeout, 250));
  return () => window.clearTimeout(handle);
}
